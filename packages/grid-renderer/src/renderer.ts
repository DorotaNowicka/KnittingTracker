import { clampCamera, hitTest, panBy, revealCell, zoomAt, type CameraState } from './camera';
import { paint, readPalette, type Palette } from './canvas2d';
import { GridGeometry, type GridSource } from './geometry';
import { buildScene, type Overlay } from './scene';

export interface RendererStats {
  /** Duration of the last frame, ms (including tiles rendered in that frame). */
  lastFrameMs: number;
  frames: number;
  /** Durations of the most recent frames (up to 240), for performance tests. */
  recent: number[];
  /** Time spent rendering tiles in the last frame that needed any, and tiles rendered in total. */
  lastStaticMs: number;
  staticRebuilds: number;
}

/** One cached tile of the static layer. */
interface Tile {
  readonly canvas: HTMLCanvasElement;
  readonly tx: number;
  readonly ty: number;
  key: string;
  used: number;
}

/** Smallest CSS-px step (≤ 64) whose length in device pixels is a whole number (1 if none). */
export function alignmentStep(dpr: number): number {
  for (let s = 1; s <= 64; s++) {
    const d = s * dpr;
    if (Math.abs(d - Math.round(d)) < 1e-3) return s;
  }
  return 1;
}

/** Tile edge in CSS px (multiple of every alignment step up to 8, see alignmentStep). */
const TILE = 256;
const TILE_OVERLAP = 2;

/**
 * Canvas controller (ADR-6): owns the camera, coalesces redraws into animation frames and paints
 * in two layers. The static layer (paper, done cells, symbols, rules) is rendered into 256-px
 * tiles kept in an LRU cache; panning only draws tiles that come into view. Each frame blits the
 * visible tiles and draws the light overlay (keeper, marker, cursor, frozen header and gutters).
 */
export class GridRenderer {
  private ctx: CanvasRenderingContext2D;
  private source: GridSource | null = null;
  private overlay: Overlay | null = null;
  private geo: GridGeometry | null = null;
  private cam: CameraState = { cell: 18, scrollX: 0, scrollY: 0, width: 0, height: 0 };
  private dpr = 1;
  private palette: Palette | null = null;
  private frame = 0;
  private font = 'system-ui, sans-serif';
  private tiles = new Map<string, Tile>();
  private tick = 0;
  private generation = 0;
  readonly stats: RendererStats = {
    lastFrameMs: 0,
    frames: 0,
    recent: [],
    lastStaticMs: 0,
    staticRebuilds: 0,
  };
  /** Called after the camera changes (zoom/pan), e.g. to sync a zoom slider. */
  onCameraChange: ((cam: CameraState) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  get camera(): CameraState {
    return this.cam;
  }

  get geometry(): GridGeometry | null {
    return this.geo;
  }

  setFont(font: string): void {
    this.font = font;
    this.dropCache();
  }

  /** Re-read theme colours from CSS (call on theme change). */
  refreshPalette(): void {
    this.palette = readPalette(this.canvas);
    this.dropCache();
  }

  setSource(source: GridSource): void {
    this.source = source;
    this.geo = new GridGeometry(source, this.cam.cell);
    this.cam = clampCamera(this.cam, this.geo);
    this.dropCache();
  }

  setOverlay(overlay: Overlay): void {
    const before = this.overlay?.staticKey;
    this.overlay = overlay;
    if (overlay.staticKey === undefined || overlay.staticKey !== before) this.generation += 1;
    this.invalidate();
  }

  /** Match the canvas backing store to its CSS size and the device pixel ratio. */
  resize(width: number, height: number, dpr: number): void {
    this.dpr = Math.max(1, Math.min(3, dpr || 1));
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.cam = { ...this.cam, width, height };
    if (this.geo) this.cam = clampCamera(this.cam, this.geo);
    this.dropCache();
  }

  zoomTo(cell: number, focusX = this.cam.width / 2, focusY = this.cam.height / 2): void {
    if (!this.source) return;
    const next = zoomAt(this.cam, this.source, cell, focusX, focusY);
    this.cam = next.state;
    this.geo = next.geo;
    this.changed();
  }

  panBy(dx: number, dy: number): void {
    if (!this.geo) return;
    this.cam = panBy(this.cam, this.geo, dx, dy);
    this.changed();
  }

  reveal(row: number, col: number, mode: 'center' | 'nearest' = 'nearest'): void {
    if (!this.geo) return;
    this.cam = revealCell(this.cam, this.geo, row, col, mode);
    this.changed();
  }

  /** Zoom so that columns first…last fill the viewport width, and show them around `row`. */
  fitColumns(firstCol: number, lastCol: number, row: number): void {
    if (!this.source || !this.geo) return;
    const m = this.geo.m;
    const span = lastCol - firstCol + 1;
    this.zoomTo((this.cam.width - 2 * m.gutter - 8) / span);
    const g = this.geo;
    const left = g.colX(firstCol) - g.m.gutter - 4;
    const rowTop = g.rowY(Math.max(1, Math.min(row, this.source.rows)));
    this.cam = clampCamera(
      { ...this.cam, scrollX: left, scrollY: rowTop - this.cam.height / 2 },
      g,
    );
    this.changed();
  }

  /** Centre of a cell in canvas CSS px (tests and accessibility helpers). */
  cellCenter(row: number, col: number): { x: number; y: number } | null {
    if (!this.geo) return null;
    const c = this.geo.m.cell;
    return {
      x: this.geo.colX(col) - this.cam.scrollX + c / 2,
      y: this.geo.rowY(row) - this.cam.scrollY + c / 2,
    };
  }

  hitTest(x: number, y: number): { row: number; col: number } | null {
    return this.geo ? hitTest(this.cam, this.geo, x, y) : null;
  }

  /** Schedule a repaint on the next animation frame (coalesced). */
  invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Paint synchronously (tests, screenshots). */
  draw(): void {
    if (!this.source || !this.overlay || !this.geo || this.cam.width === 0) return;
    const t0 = performance.now();
    this.palette ??= readPalette(this.canvas);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.palette.paper;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.blitTiles(ctx, this.source, this.geo, this.overlay, this.palette);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paint(
      ctx,
      buildScene(this.source, this.geo, this.cam, this.overlay, 'overlay'),
      this.palette,
      this.dpr,
      this.font,
    );

    this.stats.lastFrameMs = performance.now() - t0;
    this.stats.frames += 1;
    this.stats.recent.push(this.stats.lastFrameMs);
    if (this.stats.recent.length > 240) this.stats.recent.shift();
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.onCameraChange = null;
    this.tiles.clear();
  }

  /** Draw the visible static-layer tiles, rendering the ones that are missing or stale. */
  private blitTiles(
    ctx: CanvasRenderingContext2D,
    source: GridSource,
    geo: GridGeometry,
    overlay: Overlay,
    palette: Palette,
  ): void {
    const t0 = performance.now();
    const dpr = this.dpr;
    // Tiles are drawn 2 px larger than their grid step and overlap slightly, so rounding to device
    // pixels can never open a seam between them.
    const tileDevice = TILE * dpr;
    const key = `${this.generation}|${geo.m.cell}|${dpr}`;
    const originX = Math.round(-this.cam.scrollX * dpr);
    const originY = Math.round(-this.cam.scrollY * dpr);
    const tx0 = Math.floor(this.cam.scrollX / TILE);
    const ty0 = Math.floor(this.cam.scrollY / TILE);
    const tx1 = Math.floor((this.cam.scrollX + this.cam.width) / TILE);
    const ty1 = Math.floor((this.cam.scrollY + this.cam.height) / TILE);
    let rendered = 0;
    this.tick += 1;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = `${tx},${ty}`;
        let tile = this.tiles.get(id);
        if (!tile || tile.key !== key) {
          tile = this.renderTile(tile, tx, ty, key, source, geo, overlay, palette);
          this.tiles.set(id, tile);
          rendered += 1;
        }
        tile.used = this.tick;
        ctx.drawImage(
          tile.canvas,
          originX + Math.round(tx * tileDevice),
          originY + Math.round(ty * tileDevice),
        );
      }
    }
    // LRU: keep about twice the visible tiles.
    const keep = 2 * (tx1 - tx0 + 1) * (ty1 - ty0 + 1) + 8;
    if (this.tiles.size > keep) {
      const old = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [id] of old.slice(0, this.tiles.size - keep)) this.tiles.delete(id);
    }
    if (rendered > 0) {
      this.stats.lastStaticMs = performance.now() - t0;
      this.stats.staticRebuilds += rendered;
    }
  }

  private renderTile(
    previous: Tile | undefined,
    tx: number,
    ty: number,
    key: string,
    source: GridSource,
    geo: GridGeometry,
    overlay: Overlay,
    palette: Palette,
  ): Tile {
    const size = Math.ceil((TILE + TILE_OVERLAP) * this.dpr);
    const canvas = previous?.canvas ?? document.createElement('canvas');
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const tileCam: CameraState = {
      cell: geo.m.cell,
      scrollX: tx * TILE,
      scrollY: ty * TILE,
      width: TILE + TILE_OVERLAP,
      height: TILE + TILE_OVERLAP,
    };
    paint(ctx, buildScene(source, geo, tileCam, overlay, 'static'), palette, this.dpr, this.font);
    return { canvas, tx, ty, key, used: this.tick };
  }

  private dropCache(): void {
    this.generation += 1;
    this.invalidate();
  }

  private changed(): void {
    this.invalidate();
    this.onCameraChange?.(this.cam);
  }
}
