import type { Glyph } from '@kt/core';

/** Allowed on-screen cell size in CSS pixels. Cells are always square. */
export const CELL_PX_MIN = 4;
export const CELL_PX_MAX = 64;

/** Clamp a requested cell size to the supported range; non-finite input falls back to the minimum. */
export function clampCellPx(value: number): number {
  if (!Number.isFinite(value)) return CELL_PX_MIN;
  return Math.min(CELL_PX_MAX, Math.max(CELL_PX_MIN, value));
}

/** One cell as the renderer needs it (display column `col`, RS view, row 1 at the bottom). */
export interface GridCell {
  readonly glyph: Glyph;
  /** Width of the symbol in cells and which part of it this cell is (0 = leftmost). */
  readonly width: number;
  readonly part: number;
  /** "No stitch" cells are shaded instead of drawn. */
  readonly noStitch: boolean;
}

export interface Band {
  readonly label: string;
  readonly firstCol: number;
  readonly lastCol: number;
}

/**
 * What the grid shows. The app adapts a resolved pattern from `@kt/core` to this interface, so the
 * renderer stays independent of how patterns are modelled.
 */
export interface GridSource {
  /** Number of display columns (stitches) and rows to draw. */
  readonly cols: number;
  readonly rows: number;
  /** Chart zones (A.1, A.2…) as display-column ranges. */
  readonly zones: readonly Band[];
  /** Named sections (Front/Back); a visual gap separates neighbouring sections. */
  readonly sections: readonly Band[];
  cell(row: number, col: number): GridCell;
  /** Stitch number printed above a column. */
  stitchNumber(col: number): number;
  /** True when the visible rows end before the work does ("continues" edge). */
  readonly continuesAbove: boolean;
}

/** Fixed parts of the layout in CSS px, derived from the cell size. */
export interface Metrics {
  readonly cell: number;
  readonly gap: number;
  readonly gutter: number;
  readonly sectionBand: number;
  readonly zoneBand: number;
  readonly numberBand: number;
  readonly header: number;
  readonly footer: number;
}

export function metricsFor(cell: number, hasSections: boolean): Metrics {
  const c = clampCellPx(cell);
  const text = Math.min(15, Math.max(10, c * 0.7));
  const sectionBand = hasSections ? Math.round(text * 1.8) : 0;
  const zoneBand = Math.round(text * 1.7);
  const numberBand = Math.round(text * 1.5);
  return {
    cell: c,
    gap: Math.max(10, Math.round(c * 1.25)),
    gutter: Math.max(30, Math.round(text * 3)),
    sectionBand,
    zoneBand,
    numberBand,
    header: sectionBand + zoneBand + numberBand + 4,
    footer: 12,
  };
}

interface Run {
  readonly firstCol: number;
  readonly lastCol: number;
  /** World x of the left edge of `firstCol`. */
  readonly x: number;
}

/**
 * Maps grid coordinates (row, display column) to world coordinates in CSS px and back. Columns
 * are left → right; row 1 is at the bottom. A gap separates sections, as in the prototype.
 */
export class GridGeometry {
  readonly m: Metrics;
  readonly runs: readonly Run[];
  readonly width: number;
  readonly height: number;

  constructor(
    readonly source: Pick<GridSource, 'cols' | 'rows' | 'sections'>,
    cell: number,
  ) {
    this.m = metricsFor(cell, source.sections.length > 1);
    // Column runs between section boundaries.
    const breaks = new Set<number>();
    for (const s of source.sections) {
      if (s.firstCol > 1) breaks.add(s.firstCol);
      if (s.lastCol < source.cols) breaks.add(s.lastCol + 1);
    }
    const starts = [
      1,
      ...[...breaks].filter((b) => b > 1 && b <= source.cols).sort((a, b) => a - b),
    ];
    const runs: Run[] = [];
    let x = this.m.gutter;
    starts.forEach((first, i) => {
      const last = (starts[i + 1] ?? source.cols + 1) - 1;
      runs.push({ firstCol: first, lastCol: last, x });
      x += (last - first + 1) * this.m.cell + (i < starts.length - 1 ? this.m.gap : 0);
    });
    this.runs = runs;
    this.width = x + this.m.gutter;
    this.height = this.m.header + source.rows * this.m.cell + this.m.footer;
  }

  /** World x of the left edge of display column `col`. */
  colX(col: number): number {
    const run = this.runs.find((r) => col >= r.firstCol && col <= r.lastCol) ?? this.runs.at(-1);
    if (!run) return this.m.gutter;
    return run.x + (col - run.firstCol) * this.m.cell;
  }

  /** World y of the top edge of row `row`. */
  rowY(row: number): number {
    return this.m.header + (this.source.rows - row) * this.m.cell;
  }

  /** Grid x range of all columns (without gutters). */
  get gridLeft(): number {
    return this.m.gutter;
  }

  get gridRight(): number {
    return this.width - this.m.gutter;
  }

  get gridTop(): number {
    return this.m.header;
  }

  get gridBottom(): number {
    return this.m.header + this.source.rows * this.m.cell;
  }

  /** Cell under a world point, or null outside the grid (gutters, gaps, header). */
  cellAt(x: number, y: number): { row: number; col: number } | null {
    if (y < this.gridTop || y >= this.gridBottom) return null;
    const run = this.runs.find(
      (r) => x >= r.x && x < r.x + (r.lastCol - r.firstCol + 1) * this.m.cell,
    );
    if (!run) return null;
    const col = run.firstCol + Math.floor((x - run.x) / this.m.cell);
    const row = this.source.rows - Math.floor((y - this.gridTop) / this.m.cell);
    return { row, col };
  }

  /** Inclusive range of columns intersecting [x0, x1). */
  colsIn(x0: number, x1: number): { first: number; last: number } | null {
    let first = Number.POSITIVE_INFINITY;
    let last = Number.NEGATIVE_INFINITY;
    for (const r of this.runs) {
      const rx1 = r.x + (r.lastCol - r.firstCol + 1) * this.m.cell;
      if (rx1 <= x0 || r.x >= x1) continue;
      const a = r.firstCol + Math.max(0, Math.floor((x0 - r.x) / this.m.cell));
      const b =
        r.firstCol + Math.min(r.lastCol - r.firstCol, Math.ceil((x1 - r.x) / this.m.cell) - 1);
      first = Math.min(first, a);
      last = Math.max(last, b);
    }
    return Number.isFinite(first) ? { first, last } : null;
  }

  /** Inclusive range of rows intersecting [y0, y1). */
  rowsIn(y0: number, y1: number): { first: number; last: number } | null {
    const top = Math.max(y0, this.gridTop);
    const bottom = Math.min(y1, this.gridBottom);
    if (bottom <= top) return null;
    const highest = this.source.rows - Math.floor((top - this.gridTop) / this.m.cell);
    const lowest = this.source.rows - Math.ceil((bottom - this.gridTop) / this.m.cell) + 1;
    return { first: Math.max(1, lowest), last: Math.min(this.source.rows, highest) };
  }
}
