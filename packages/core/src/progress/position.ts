import type { ResolvedPattern, Side } from '../layout/resolve';

/**
 * Progress model (FR-12, ADR-2): progress in a pattern is ONE number, `done` — how many worked cells
 * have been completed, counted in work order through the rows. Everything else (current row,
 * last stitch, percentages) is derived from it.
 *
 * Work order: rows bottom → top. RS rows are worked right → left in the RS view (stitch 1 first),
 * WS rows left → right (stitch n first). "No stitch" cells are skipped: they are never tapped.
 */

export interface StitchLocation {
  /** Stage row (1-based). */
  readonly row: number;
  /** 1-based position within the row in work order (counting only worked cells). */
  readonly work: number;
  /** Stitch number in RS work order (what the column header shows). */
  readonly stitch: number;
  /** Display column in RS view. */
  readonly col: number;
  readonly side: Side;
  /** Global progress index of this stitch: `done` equals this when it is the last one done. */
  readonly index: number;
}

/**
 * Row geometry of a resolved pattern with lazily computed, memoized prefix sums. Works for
 * open-ended patterns: rows are computed only as far as they are needed.
 */
export interface RowModel {
  readonly grid: ResolvedPattern;
  /** What one unit of progress is: a stitch, or a whole row in row-counter patterns (DR-9). */
  readonly unit: 'stitch' | 'row';
  /** Worked cells in work order for `row`, as stitch numbers (RS numbering). */
  workOrder(row: number): readonly number[];
  rowLength(row: number): number;
  /** Number of worked cells in rows 1…row-1. */
  rowStart(row: number): number;
  /** Total cells of the pattern, or null when the pattern is open-ended. */
  total(): number | null;
}

export function createRowModel(grid: ResolvedPattern): RowModel {
  const orders = new Map<number, readonly number[]>();
  const starts: number[] = [0, 0]; // starts[r] = cells before row r; index 0 unused.

  const workOrder = (row: number): readonly number[] => {
    let order = orders.get(row);
    if (!order) {
      const n = grid.stitchCount;
      const rs = grid.side(row) === 'RS';
      const list: number[] = [];
      for (let i = 1; i <= n; i++) {
        const stitch = rs ? i : n - i + 1;
        const cell = grid.cellAtStitch(row, stitch);
        if (grid.symbol(cell).worked) list.push(stitch);
      }
      order = list;
      orders.set(row, order);
    }
    return order;
  };

  const rowLength = (row: number) => workOrder(row).length;

  const rowStart = (row: number): number => {
    if (row < 1) throw new RangeError(`Invalid row ${row}`);
    for (let r = starts.length; r <= row; r++) {
      starts[r] = (starts[r - 1] ?? 0) + rowLength(r - 1);
    }
    return starts[row] ?? 0;
  };

  const total = () =>
    grid.plannedRows === null ? null : rowStart(grid.plannedRows) + rowLength(grid.plannedRows);

  return { grid, unit: 'stitch', workOrder, rowLength, rowStart, total };
}

/**
 * Row-counter model (DR-9): every row is one unit of progress, so `done` is the number of finished
 * rows. The same reducer (complete row, set, undo/redo) works unchanged.
 */
export function createCounterModel(grid: ResolvedPattern): RowModel {
  const one: readonly number[] = [1];
  return {
    grid,
    unit: 'row',
    workOrder: () => one,
    rowLength: () => 1,
    rowStart: (row) => {
      if (row < 1) throw new RangeError(`Invalid row ${row}`);
      return row - 1;
    },
    total: () => grid.plannedRows,
  };
}

/**
 * The progress model a pattern asks for: per stitch (default) or a row counter. A pattern with no
 * stitches yet (a part set up without a grid) can only count rows.
 */
export const createProgressModel = (grid: ResolvedPattern): RowModel =>
  grid.pattern.tracking === 'rows' || grid.stitchCount === 0
    ? createCounterModel(grid)
    : createRowModel(grid);

function location(model: RowModel, row: number, work: number): StitchLocation {
  const stitch = model.workOrder(row)[work - 1];
  if (stitch === undefined) throw new RangeError(`Row ${row} has no worked cell ${work}`);
  return {
    row,
    work,
    stitch,
    col: Math.max(1, model.grid.stitchCount - stitch + 1),
    side: model.grid.side(row),
    index: model.rowStart(row) + work,
  };
}

/** Row containing global index `index` (1-based). Rows with zero worked cells are skipped. */
function rowOfIndex(model: RowModel, index: number): number {
  // Exponential search for an upper bound, then binary search on the memoized prefix sums.
  let hi = 1;
  while (model.rowStart(hi + 1) < index) {
    hi *= 2;
    if (hi > 1_000_000) throw new RangeError(`Index ${index} is unreachable in this pattern`);
  }
  let lo = Math.max(1, Math.floor(hi / 2));
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (model.rowStart(mid + 1) < index) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The stitch at global index `index` (1-based), or null if the index is outside the pattern. */
export function stitchAt(model: RowModel, index: number): StitchLocation | null {
  if (!Number.isInteger(index) || index < 1) return null;
  const total = model.total();
  if (total !== null && index > total) return null;
  const row = rowOfIndex(model, index);
  return location(model, row, index - model.rowStart(row));
}

/** Last completed stitch for a given `done`, or null when nothing is done yet. */
export const lastDone = (model: RowModel, done: number): StitchLocation | null =>
  stitchAt(model, done);

/** Next stitch to work, or null when the (planned) pattern is complete. */
export const nextStitch = (model: RowModel, done: number): StitchLocation | null =>
  stitchAt(model, done + 1);

/** Global index of the cell at (row, stitch); null for "no stitch" cells or out-of-range input. */
export function indexOfStitch(model: RowModel, row: number, stitch: number): number | null {
  if (!Number.isInteger(row) || row < 1) return null;
  if (model.grid.plannedRows !== null && row > model.grid.plannedRows) return null;
  // Row counter: any cell of a row stands for the whole row.
  if (model.unit === 'row') return row;
  if (stitch < 1 || stitch > model.grid.stitchCount) return null;
  const work = model.workOrder(row).indexOf(stitch);
  return work < 0 ? null : model.rowStart(row) + work + 1;
}

/** Global index of the cell at display column `col` of `row`. */
export const indexOfCol = (model: RowModel, row: number, col: number): number | null =>
  indexOfStitch(model, row, model.grid.stitchCount - col + 1);

export interface ProgressSummary {
  readonly done: number;
  readonly total: number | null;
  /** 0–100 for planned patterns, null for open-ended ones. */
  readonly percent: number | null;
  readonly lastDone: StitchLocation | null;
  readonly next: StitchLocation | null;
  /** Fully completed rows (or rounds). */
  readonly rowsCompleted: number;
  /** Row being worked: the row of the next stitch (or the last row when the pattern is complete). */
  readonly currentRow: number;
  /** Stitches done in the current row. */
  readonly doneInCurrentRow: number;
}

export function summarize(model: RowModel, done: number): ProgressSummary {
  const total = model.total();
  const last = lastDone(model, done);
  const next = nextStitch(model, done);
  const currentRow = next?.row ?? last?.row ?? 1;
  const doneInCurrentRow = next ? next.work - 1 : (last?.work ?? 0);
  const rowsCompleted = next ? next.row - 1 : (last?.row ?? 0);
  return {
    done,
    total,
    percent: total === null || total === 0 ? null : Math.min(100, (done / total) * 100),
    lastDone: last,
    next,
    rowsCompleted,
    currentRow,
    doneInCurrentRow,
  };
}
