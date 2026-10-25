import type { Glyph } from '@kt/core';
import type { CameraState } from './camera';
import type { GridGeometry, GridSource, Guide } from './geometry';

/** Colour roles; the backend maps them to theme colours (CSS custom properties). */
export type ColorRole =
  | 'sheet'
  | 'paper'
  | 'ink'
  | 'inkMuted'
  | 'rule'
  | 'ruleStrong'
  | 'zone'
  | 'indigo'
  | 'onIndigo'
  | 'done'
  | 'doneHatch'
  | 'marker'
  | 'noStitch'
  | 'danger'
  | 'guide'
  | 'guideHalf';

/** Progress state shown on top of the chart. Rows/cols are grid coordinates. */
export interface Overlay {
  /** Done cells per row: `all`, a display-column range, or nothing. */
  done(row: number): 'all' | { readonly fromCol: number; readonly toCol: number } | null;
  /** Row being worked (the row keeper sits on it), or null when the pattern is complete. */
  readonly currentRow: number | null;
  /** Work direction of the current row in the RS view. */
  readonly direction: 'right-to-left' | 'left-to-right';
  /** Last done stitch (stitch marker). */
  readonly marker: { readonly row: number; readonly col: number } | null;
  /** Keyboard cursor. */
  readonly cursor: { readonly row: number; readonly col: number } | null;
  /** Veil rows above the current row (magnetic keeper metaphor). */
  readonly veilAbove: boolean;
  /**
   * Changes whenever `done()` would return something different. The renderer keeps the static
   * layer (which includes done cells) cached while this key stays the same.
   */
  readonly staticKey?: string;
  /** Editor selection (inclusive grid rectangle). */
  readonly selection?: {
    readonly row1: number;
    readonly col1: number;
    readonly row2: number;
    readonly col2: number;
  } | null;
  /** Cells to flag, e.g. validation problems in the editor. */
  readonly highlights?: readonly { readonly row: number; readonly col: number }[];
}

export type DrawCommand =
  | {
      readonly t: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: ColorRole;
      readonly alpha?: number;
    }
  | {
      readonly t: 'lines';
      readonly segments: readonly number[];
      readonly stroke: ColorRole;
      readonly width: number;
      readonly dash?: readonly number[];
    }
  | {
      readonly t: 'hatch';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly stroke: ColorRole;
      readonly spacing: number;
      readonly width: number;
      /** World offset (scrollX − scrollY) so hatch lines stay fixed to the chart while panning. */
      readonly phase: number;
    }
  | {
      readonly t: 'glyphs';
      readonly cell: number;
      readonly stroke: ColorRole;
      readonly lineWidth: number;
      readonly items: readonly { readonly x: number; readonly y: number; readonly glyph: Glyph }[];
    }
  | {
      readonly t: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly size: number;
      readonly weight: number;
      readonly color: ColorRole;
      readonly align: 'left' | 'center' | 'right';
    }
  | { readonly t: 'marker'; readonly x: number; readonly y: number; readonly size: number }
  | {
      readonly t: 'arrow';
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly dir: 'left' | 'right';
      readonly color: ColorRole;
    }
  | {
      readonly t: 'clip';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | { readonly t: 'unclip' };

/** Level of detail by cell size: below these sizes details are dropped to keep zoomed-out views fast and calm. */
export const LOD = { glyphs: 4.5, rules: 4.5, everyRowNumber: 13 } as const;

/**
 * Which part of the scene to build:
 * - `static`: chart paper, done cells, symbols and rules for a world region (cached by the renderer
 *   and only rebuilt when progress, zoom or the region changes);
 * - `overlay`: what moves with every frame or must stay on screen (veil, row keeper, stitch
 *   marker, cursor, frozen header and gutters);
 * - `all`: both, in one pass (tests, snapshots).
 */
export type SceneLayers = 'all' | 'static' | 'overlay';

/**
 * Build the draw list for the visible part of the grid. Pure: same input → same commands,
 * snapshot-testable without a canvas. Coordinates are CSS px in screen space.
 */
export function buildScene(
  source: GridSource,
  geo: GridGeometry,
  cam: CameraState,
  overlay: Overlay,
  layers: SceneLayers = 'all',
  /** Only build cells inside this world rectangle (incremental static-layer updates). */
  limit?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): DrawCommand[] {
  const out: DrawCommand[] = [];
  const m = geo.m;
  const c = m.cell;
  const sx = (x: number) => x - cam.scrollX;
  const sy = (y: number) => y - cam.scrollY;
  const doStatic = layers !== 'overlay';
  const doOverlay = layers !== 'static';
  // The static layer covers a whole world region; the frozen header only exists on screen.
  const top = layers === 'static' ? 0 : m.header;

  const area = limit ?? { x: cam.scrollX, y: cam.scrollY + top, w: cam.width, h: cam.height - top };
  const cols = geo.colsIn(area.x, area.x + area.w);
  const rows = geo.rowsIn(area.y, area.y + area.h);

  if (doStatic) {
    out.push(
      limit
        ? { t: 'rect', x: sx(limit.x), y: sy(limit.y), w: limit.w, h: limit.h, fill: 'paper' }
        : { t: 'rect', x: 0, y: 0, w: cam.width, h: cam.height, fill: 'paper' },
    );
  }

  // Sheet behind each column run (clipped to the area being built).
  if (doStatic) {
    out.push({ t: 'clip', x: sx(area.x), y: sy(area.y), w: area.w, h: area.h });
    for (const r of geo.runs) {
      out.push({
        t: 'rect',
        x: sx(r.x),
        y: sy(geo.gridTop),
        w: (r.lastCol - r.firstCol + 1) * c,
        h: geo.gridBottom - geo.gridTop,
        fill: 'sheet',
      });
    }
    out.push({ t: 'unclip' });
  }

  if (cols && rows) {
    out.push({ t: 'clip', x: sx(area.x), y: sy(area.y), w: area.w, h: area.h });

    // Done cells: tint + hatch (never colour alone).
    for (let row = rows.first; doStatic && row <= rows.last; row++) {
      const d = overlay.done(row);
      if (!d) continue;
      const y = sy(geo.rowY(row));
      const spans =
        d === 'all'
          ? geo.runs.map((r) => [r.firstCol, r.lastCol] as const)
          : splitByRuns(geo, d.fromCol, d.toCol);
      for (const [a, b] of spans) {
        const lo = Math.max(a, cols.first);
        const hi = Math.min(b, cols.last);
        if (lo > hi) continue;
        const x = sx(geo.colX(lo));
        const w = (hi - lo + 1) * c;
        out.push({ t: 'rect', x, y, w, h: c, fill: 'done' });
        if (c >= LOD.rules)
          out.push({
            t: 'hatch',
            phase: cam.scrollX - cam.scrollY,
            x,
            y,
            w,
            h: c,
            stroke: 'doneHatch',
            spacing: Math.max(5, c / 2.5),
            width: Math.max(1, c / 22),
          });
      }
    }

    // No-stitch cells and glyphs.
    const items: { x: number; y: number; glyph: Glyph }[] = [];
    for (let row = rows.first; doStatic && row <= rows.last; row++) {
      const y = sy(geo.rowY(row));
      for (let col = cols.first; col <= cols.last; col++) {
        const cell = source.cell(row, col);
        const x = sx(geo.colX(col));
        if (cell.noStitch) {
          out.push({ t: 'rect', x, y, w: c, h: c, fill: 'noStitch' });
          continue;
        }
        // Glyphs are anchored at the symbol's leftmost cell; draw from the first visible part.
        if (
          c >= LOD.glyphs &&
          (cell.part === 0 || col === cols.first) &&
          cell.glyph.primitives.length > 0
        ) {
          items.push({ x: x - cell.part * c, y, glyph: cell.glyph });
        }
      }
    }

    // Grid rules (thin), then zone and section borders (strong).
    if (doStatic && c >= LOD.rules) {
      const segs: number[] = [];
      for (const r of geo.runs) {
        const a = Math.max(r.firstCol, cols.first);
        const b = Math.min(r.lastCol, cols.last);
        if (a > b) continue;
        const top = sy(geo.rowY(rows.last));
        const bottom = sy(geo.rowY(rows.first) + c);
        const left = sx(geo.colX(a));
        const right = left + (b - a + 1) * c;
        for (let col = a; col <= b + 1; col++) {
          const x = left + (col - a) * c;
          segs.push(x, top, x, bottom);
        }
        segs.push(left, top, right, top);
        for (let row = rows.first; row <= rows.last; row++) {
          const y = sy(geo.rowY(row) + c);
          segs.push(left, y, right, y);
        }
      }
      out.push({ t: 'lines', segments: segs, stroke: 'rule', width: 1 });
    }
    if (items.length > 0) {
      out.push({ t: 'glyphs', cell: c, stroke: 'ink', lineWidth: Math.max(1.2, c * 0.1), items });
    }
    if (doStatic) out.push(zoneBorders(source, geo, cam, rows));
    if (doStatic && source.guides && source.guides.length > 0) {
      out.push(...guideLines(source.guides, geo, cam, rows));
    }

    // Veil above the current row, keeper frame and strip, marker, cursor.
    if (doOverlay && overlay.currentRow !== null) {
      const cr = overlay.currentRow;
      if (overlay.veilAbove && cr < source.rows) {
        const yTop = sy(geo.gridTop);
        const yBottom = sy(geo.rowY(cr));
        if (yBottom > yTop) {
          for (const r of geo.runs) {
            out.push({
              t: 'rect',
              x: sx(r.x),
              y: yTop,
              w: (r.lastCol - r.firstCol + 1) * c,
              h: yBottom - yTop,
              fill: 'paper',
              alpha: 0.3,
            });
          }
        }
      }
    }
    if (doOverlay && overlay.marker) {
      const { row, col } = overlay.marker;
      out.push({ t: 'marker', x: sx(geo.colX(col)), y: sy(geo.rowY(row)), size: c });
    }
    if (doOverlay && overlay.currentRow !== null) {
      const y = sy(geo.rowY(overlay.currentRow));
      const strip = Math.max(4, Math.round(c * 0.28));
      for (const r of geo.runs) {
        const x = sx(r.x);
        const w = (r.lastCol - r.firstCol + 1) * c;
        // Frame around the current row and the keeper strip just above it.
        out.push({
          t: 'lines',
          segments: [
            x,
            y,
            x + w,
            y,
            x + w,
            y + c,
            x,
            y + c,
            x,
            y,
            x,
            y + c,
            x + w,
            y,
            x + w,
            y + c,
          ],
          stroke: 'indigo',
          width: 2,
        });
        out.push({ t: 'rect', x: x - 2, y: y - strip, w: w + 4, h: strip, fill: 'indigo' });
      }
    }
    if (doOverlay && overlay.highlights) {
      const segs: number[] = [];
      for (const h of overlay.highlights) {
        if (h.row < rows.first || h.row > rows.last) continue;
        const x = sx(geo.colX(h.col));
        const y = sy(geo.rowY(h.row));
        segs.push(x + 1, y + 1, x + c - 1, y + 1, x + c - 1, y + 1, x + c - 1, y + c - 1);
        segs.push(x + c - 1, y + c - 1, x + 1, y + c - 1, x + 1, y + c - 1, x + 1, y + 1);
      }
      if (segs.length > 0) out.push({ t: 'lines', segments: segs, stroke: 'danger', width: 2.5 });
    }
    if (doOverlay && overlay.selection) {
      const s = overlay.selection;
      const x1 = sx(geo.colX(Math.min(s.col1, s.col2)));
      const x2 = sx(geo.colX(Math.max(s.col1, s.col2)) + c);
      // Rows grow upwards: the top edge belongs to the higher row.
      const y1 = sy(geo.rowY(Math.max(s.row1, s.row2)));
      const y2 = sy(geo.rowY(Math.min(s.row1, s.row2)) + c);
      out.push({ t: 'rect', x: x1, y: y1, w: x2 - x1, h: y2 - y1, fill: 'indigo', alpha: 0.12 });
      out.push({
        t: 'lines',
        segments: [x1, y1, x2, y1, x2, y1, x2, y2, x2, y2, x1, y2, x1, y2, x1, y1],
        stroke: 'indigo',
        width: 2,
        dash: [6, 4],
      });
    }
    if (doOverlay && overlay.cursor) {
      const { row, col } = overlay.cursor;
      const x = sx(geo.colX(col));
      const y = sy(geo.rowY(row));
      out.push({
        t: 'lines',
        segments: [
          x + 1,
          y + 1,
          x + c - 1,
          y + 1,
          x + c - 1,
          y + 1,
          x + c - 1,
          y + c - 1,
          x + c - 1,
          y + c - 1,
          x + 1,
          y + c - 1,
          x + 1,
          y + c - 1,
          x + 1,
          y + 1,
        ],
        stroke: 'indigo',
        width: 3,
        dash: [4, 3],
      });
    }
    out.push({ t: 'unclip' });
  }

  if (!doOverlay) return out;
  // Frozen row-number gutters (left and right) and header bands.
  out.push(...gutters(geo, cam, rows, overlay));
  out.push(...header(source, geo, cam, cols));
  if (source.continuesAbove && cam.scrollY < geo.m.cell * 2) {
    const y = sy(geo.gridTop) - 1;
    out.push({
      t: 'lines',
      segments: geo.runs.flatMap((r) => [
        sx(r.x),
        y,
        sx(r.x) + (r.lastCol - r.firstCol + 1) * c,
        y,
      ]),
      stroke: 'ruleStrong',
      width: 2,
      dash: [6, 5],
    });
  }
  return out;
}

function splitByRuns(geo: GridGeometry, from: number, to: number): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (const r of geo.runs) {
    const a = Math.max(from, r.firstCol);
    const b = Math.min(to, r.lastCol);
    if (a <= b) out.push([a, b]);
  }
  return out;
}

function zoneBorders(
  source: GridSource,
  geo: GridGeometry,
  cam: CameraState,
  rows: { first: number; last: number },
): DrawCommand {
  const segs: number[] = [];
  const top = geo.rowY(rows.last) - cam.scrollY;
  const bottom = geo.rowY(rows.first) + geo.m.cell - cam.scrollY;
  const edges = new Set<number>();
  for (const z of source.zones) {
    edges.add(geo.colX(z.firstCol));
    edges.add(geo.colX(z.lastCol) + geo.m.cell);
  }
  for (const x of edges) segs.push(x - cam.scrollX, top, x - cam.scrollX, bottom);
  // Outer top/bottom border of each run.
  for (const r of geo.runs) {
    const x0 = r.x - cam.scrollX;
    const x1 = x0 + (r.lastCol - r.firstCol + 1) * geo.m.cell;
    if (rows.first === 1) segs.push(x0, bottom, x1, bottom);
    if (rows.last === source.rows) segs.push(x0, top, x1, top);
  }
  return {
    t: 'lines',
    segments: segs,
    stroke: 'ruleStrong',
    width: Math.max(1.5, geo.m.cell / 12),
  };
}

/** Guide lines through the visible rows, quarters and the half in their own colours. */
function guideLines(
  guides: readonly Guide[],
  geo: GridGeometry,
  cam: CameraState,
  rows: { first: number; last: number },
): DrawCommand[] {
  const top = geo.rowY(rows.last) - cam.scrollY;
  const bottom = geo.rowY(rows.first) + geo.m.cell - cam.scrollY;
  const of = (kind: Guide['kind']) =>
    guides
      .filter((g) => g.kind === kind && g.atCol > 1 && g.atCol <= geo.source.cols)
      .flatMap((g) => {
        const x = geo.colX(g.atCol) - cam.scrollX;
        return [x, top, x, bottom];
      });
  const width = Math.max(2, geo.m.cell / 7);
  return [
    { t: 'lines', segments: of('quarter'), stroke: 'guide', width },
    { t: 'lines', segments: of('half'), stroke: 'guideHalf', width: width * 1.25 },
  ];
}

function gutters(
  geo: GridGeometry,
  cam: CameraState,
  rows: { first: number; last: number } | null,
  overlay: Overlay,
): DrawCommand[] {
  const m = geo.m;
  // Gutters stay on screen while scrolling, but hug the grid when it is narrower than the view.
  const left = Math.max(0, -cam.scrollX);
  const right = Math.min(cam.width, geo.width - cam.scrollX) - m.gutter;
  const out: DrawCommand[] = [
    { t: 'rect', x: left, y: m.header, w: m.gutter, h: cam.height - m.header, fill: 'paper' },
    { t: 'rect', x: right, y: m.header, w: m.gutter, h: cam.height - m.header, fill: 'paper' },
  ];
  if (!rows) return out;
  out.push({ t: 'clip', x: 0, y: m.header, w: cam.width, h: cam.height - m.header });
  const size = Math.min(15, Math.max(10, m.cell * 0.62));
  const every = m.cell >= LOD.everyRowNumber ? 1 : m.cell >= 7 ? 5 : 10;
  for (let row = rows.first; row <= rows.last; row++) {
    const current = row === overlay.currentRow;
    if (!current && row % every !== 0 && row !== 1) continue;
    const y = geo.rowY(row) - cam.scrollY + m.cell / 2;
    const color: ColorRole = current ? 'indigo' : 'inkMuted';
    const weight = current ? 700 : 450;
    out.push({
      t: 'text',
      x: left + m.gutter - 6,
      y,
      text: String(row),
      size,
      weight,
      color,
      align: 'right',
    });
    out.push({
      t: 'text',
      x: right + 6,
      y,
      text: String(row),
      size,
      weight,
      color,
      align: 'left',
    });
  }
  if (
    overlay.currentRow !== null &&
    overlay.currentRow >= rows.first &&
    overlay.currentRow <= rows.last
  ) {
    const y = geo.rowY(overlay.currentRow) - cam.scrollY + m.cell / 2;
    const dir = overlay.direction === 'right-to-left' ? 'left' : 'right';
    const a = Math.min(12, Math.max(7, m.cell * 0.55));
    // Arrows point the way the row is worked, on the side where work starts and ends.
    out.push({ t: 'arrow', x: left + a + 3, y, size: a, dir, color: 'indigo' });
    out.push({ t: 'arrow', x: right + m.gutter - a - 3, y, size: a, dir, color: 'indigo' });
  }
  out.push({ t: 'unclip' });
  return out;
}

function header(
  source: GridSource,
  geo: GridGeometry,
  cam: CameraState,
  cols: { first: number; last: number } | null,
): DrawCommand[] {
  const m = geo.m;
  const out: DrawCommand[] = [{ t: 'rect', x: 0, y: 0, w: cam.width, h: m.header, fill: 'paper' }];
  if (!cols) return out;
  const sx = (x: number) => x - cam.scrollX;
  const text = Math.min(15, Math.max(10, m.cell * 0.7));
  out.push({ t: 'clip', x: m.gutter, y: 0, w: cam.width - 2 * m.gutter, h: m.header });

  // Section names (Front / Back).
  if (m.sectionBand > 0) {
    for (const s of source.sections) {
      const x0 = sx(geo.colX(s.firstCol));
      const x1 = sx(geo.colX(s.lastCol) + m.cell);
      if (x1 < 0 || x0 > cam.width) continue;
      const cx = Math.min(
        Math.max((x0 + x1) / 2, Math.max(x0, m.gutter) + 40),
        Math.min(x1, cam.width - m.gutter) - 40,
      );
      out.push({
        t: 'text',
        x: cx,
        y: m.sectionBand / 2 + 1,
        text: s.label,
        size: text + 1,
        weight: 650,
        color: 'ink',
        align: 'center',
      });
    }
  }
  // Zone bands (A.1, A.2…).
  const zy = m.sectionBand;
  for (const z of source.zones) {
    const x0 = sx(geo.colX(z.firstCol));
    const x1 = sx(geo.colX(z.lastCol) + m.cell);
    if (x1 < 0 || x0 > cam.width) continue;
    out.push({
      t: 'rect',
      x: x0 + 1,
      y: zy + 2,
      w: Math.max(0, x1 - x0 - 2),
      h: m.zoneBand - 4,
      fill: 'zone',
    });
    if (x1 - x0 >= text * 2) {
      out.push({
        t: 'text',
        x: (x0 + x1) / 2,
        y: zy + m.zoneBand / 2,
        text: z.label,
        size: text,
        weight: 600,
        color: 'ink',
        align: 'center',
      });
    }
  }
  // Stitch numbers: every 10 and the first stitch of each section.
  const ny = m.sectionBand + m.zoneBand + m.numberBand / 2;
  const starts = new Set(source.sections.map((s) => s.lastCol));
  const minGap = text * 2.6;
  let lastX = Number.NEGATIVE_INFINITY;
  for (let col = cols.first; col <= cols.last; col++) {
    const n = source.stitchNumber(col);
    if (n % 10 !== 0 && n !== 1 && !starts.has(col)) continue;
    const x = sx(geo.colX(col) + m.cell / 2);
    if (Math.abs(x - lastX) < minGap) continue;
    lastX = x;
    out.push({
      t: 'text',
      x,
      y: ny,
      text: String(n),
      size: text * 0.92,
      weight: 450,
      color: 'inkMuted',
      align: 'center',
    });
  }
  out.push({ t: 'unclip' });
  return out;
}
