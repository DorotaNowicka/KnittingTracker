import { CONTINUATION, type Chart } from '../schema/pattern';
import { STD } from '../symbols/library';
import type { SymbolRegistry } from '../symbols/registry';

/**
 * Chart editing (FR-5) on a simple cell grid: `rows[r][c]` is the symbol id anchored at that cell
 * or `.` for a continuation cell of the symbol to its left. Rows are bottom → top, columns
 * left → right in RS view, exactly like {@link Chart.rows}.
 *
 * Every operation returns a new grid and finishes with {@link repairRows}, so the result is always
 * well formed: a symbol that an edit cut in half is replaced by the fill symbol (knit by default).
 * All functions are pure and never throw for out-of-range input; positions are clamped.
 */
export type SymbolRows = readonly (readonly string[])[];

/** Inclusive cell rectangle, 1-based (row 1 = bottom, col 1 = left). */
export interface CellRect {
  readonly row1: number;
  readonly col1: number;
  readonly row2: number;
  readonly col2: number;
}

/** Copied cells; may contain whole multi-cell symbols only. */
export interface Clip {
  readonly width: number;
  readonly height: number;
  readonly rows: SymbolRows;
}

export const DEFAULT_FILL = STD.knit;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Normalize a rectangle so that row1 ≤ row2 and col1 ≤ col2, clamped to the grid. */
export function normalizeRect(rect: CellRect, width: number, height: number): CellRect {
  return {
    row1: clamp(Math.min(rect.row1, rect.row2), 1, height),
    row2: clamp(Math.max(rect.row1, rect.row2), 1, height),
    col1: clamp(Math.min(rect.col1, rect.col2), 1, width),
    col2: clamp(Math.max(rect.col1, rect.col2), 1, width),
  };
}

export const gridWidth = (rows: SymbolRows): number => rows[0]?.length ?? 0;

/** Expand a chart's row strings into a symbol grid (unknown characters become the fill). */
export function chartToSymbolRows(chart: Chart, fill: string = DEFAULT_FILL): string[][] {
  return chart.rows.map((row) =>
    Array.from(row).map((ch) => (ch === CONTINUATION ? CONTINUATION : (chart.palette[ch] ?? fill))),
  );
}

const ALPHABET = 'kpabcdefghijlmnoqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Write a symbol grid back into a chart. Palette keys already used by the chart are kept (so a
 * small edit gives a small file diff); new symbols get the next free key; unused keys are dropped.
 */
export function applySymbolRows(chart: Chart, rows: SymbolRows): Chart {
  const used = new Set<string>();
  for (const row of rows) for (const id of row) if (id !== CONTINUATION) used.add(id);
  const keyOf = new Map<string, string>();
  for (const [key, id] of Object.entries(chart.palette)) {
    if (used.has(id) && !keyOf.has(id) && key !== CONTINUATION) keyOf.set(id, key);
  }
  const taken = new Set(keyOf.values());
  for (const id of used) {
    if (keyOf.has(id)) continue;
    const preferred = id === STD.knit ? 'k' : id === STD.purl ? 'p' : undefined;
    // k and p stay reserved for knit and purl while other keys are free, so files read naturally.
    const key =
      preferred && !taken.has(preferred)
        ? preferred
        : ([...ALPHABET].find((k) => !taken.has(k) && k !== 'k' && k !== 'p') ??
          [...ALPHABET].find((k) => !taken.has(k)));
    if (!key) throw new Error('Too many distinct symbols for one chart');
    keyOf.set(id, key);
    taken.add(key);
  }
  const palette: Record<string, string> = {};
  for (const [id, key] of keyOf) palette[key] = id;
  return {
    ...chart,
    width: gridWidth(rows),
    height: rows.length,
    palette,
    rows: rows.map((row) =>
      row.map((id) => (id === CONTINUATION ? CONTINUATION : (keyOf.get(id) ?? ''))).join(''),
    ),
  };
}

/** A new chart filled with one symbol. */
export function blankChart(
  base: Pick<Chart, 'id' | 'name'>,
  width: number,
  height: number,
  fill: string = DEFAULT_FILL,
): Chart {
  const rows = Array.from({ length: height }, () => Array<string>(width).fill(fill));
  return applySymbolRows({ ...base, width, height, palette: {}, rows: [] }, rows);
}

const widthOf = (registry: SymbolRegistry, id: string) => registry.get(id)?.width ?? 1;

/**
 * Make every row well formed: each anchor is followed by exactly `width − 1` continuation cells.
 * Truncated symbols and orphan continuation cells become `fill`.
 */
export function repairRows(
  rows: SymbolRows,
  registry: SymbolRegistry,
  fill: string = DEFAULT_FILL,
): string[][] {
  return rows.map((row) => {
    const out = [...row];
    let c = 0;
    while (c < out.length) {
      const id = out[c] ?? fill;
      if (id === CONTINUATION || !registry.has(id)) {
        out[c] = fill;
        c += 1;
        continue;
      }
      const w = widthOf(registry, id);
      let ok = c + w <= out.length;
      for (let k = 1; ok && k < w; k++) ok = out[c + k] === CONTINUATION;
      if (!ok) {
        out[c] = fill;
        c += 1;
        continue;
      }
      c += w;
    }
    return out;
  });
}

const mutable = (rows: SymbolRows): string[][] => rows.map((r) => [...r]);

/** Anchor column of the symbol covering (row, col), 1-based. */
export function anchorAt(rows: SymbolRows, row: number, col: number): number {
  const r = rows[row - 1];
  if (!r) return col;
  let c = col;
  while (c > 1 && r[c - 1] === CONTINUATION) c -= 1;
  return c;
}

/**
 * Place `symbolId` with its leftmost cell at (row, col). Wide symbols are shifted left to fit the
 * chart. Any symbol the new one overlaps is removed (its remaining cells become `fill`).
 */
export function paintCell(
  rows: SymbolRows,
  registry: SymbolRegistry,
  row: number,
  col: number,
  symbolId: string,
  fill: string = DEFAULT_FILL,
): string[][] {
  const width = gridWidth(rows);
  const r = rows[row - 1];
  if (!r || width === 0) return mutable(rows);
  const w = Math.min(widthOf(registry, symbolId), width);
  const start = clamp(col, 1, width - w + 1);
  const out = mutable(rows);
  const target = out[row - 1];
  if (!target) return out;
  // Clear the symbols that overlap the new one, entirely.
  const from = anchorAt(rows, row, start);
  let to = start + w - 1;
  while (to < width && target[to] === CONTINUATION) to += 1;
  for (let c = from; c <= to; c++) target[c - 1] = fill;
  target[start - 1] = symbolId;
  for (let k = 1; k < w; k++) target[start - 1 + k] = CONTINUATION;
  return repairRows(out, registry, fill);
}

/**
 * Fill a rectangle with a symbol. Wide symbols are tiled from the left edge; columns that don't
 * fit a whole symbol get `fill`.
 */
export function fillRect(
  rows: SymbolRows,
  registry: SymbolRegistry,
  rect: CellRect,
  symbolId: string,
  fill: string = DEFAULT_FILL,
): string[][] {
  const width = gridWidth(rows);
  if (width === 0 || rows.length === 0) return mutable(rows);
  const r = normalizeRect(rect, width, rows.length);
  const span = r.col2 - r.col1 + 1;
  const w = Math.min(widthOf(registry, symbolId), span);
  const full = widthOf(registry, symbolId) <= span;
  const out = mutable(rows);
  for (let row = r.row1; row <= r.row2; row++) {
    const target = out[row - 1];
    if (!target) continue;
    // Remove symbols crossing the rectangle edges, then write the tiles.
    const from = anchorAt(rows, row, r.col1);
    let to = r.col2;
    while (to < width && target[to] === CONTINUATION) to += 1;
    for (let c = from; c <= to; c++) target[c - 1] = fill;
    if (!full) continue;
    for (let c = r.col1; c + w - 1 <= r.col2; c += w) {
      target[c - 1] = symbolId;
      for (let k = 1; k < w; k++) target[c - 1 + k] = CONTINUATION;
    }
  }
  return repairRows(out, registry, fill);
}

/**
 * Grow a rectangle horizontally so it never cuts a multi-cell symbol (selections snap to whole
 * symbols, so copy, mirror and paste keep cables intact).
 */
export function snapRect(rows: SymbolRows, registry: SymbolRegistry, rect: CellRect): CellRect {
  const width = gridWidth(rows);
  let { col1, col2 } = normalizeRect(rect, width, rows.length);
  const { row1, row2 } = normalizeRect(rect, width, rows.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (let row = row1; row <= row2; row++) {
      const a = anchorAt(rows, row, col1);
      if (a < col1) {
        col1 = a;
        changed = true;
      }
      const b = anchorAt(rows, row, col2);
      const id = rows[row - 1]?.[b - 1];
      const end = b + (id ? widthOf(registry, id) : 1) - 1;
      if (end > col2) {
        col2 = Math.min(end, width);
        changed = true;
      }
    }
  }
  return { row1, row2, col1, col2 };
}

export function copyRect(rows: SymbolRows, registry: SymbolRegistry, rect: CellRect): Clip {
  const r = snapRect(rows, registry, rect);
  const out: string[][] = [];
  for (let row = r.row1; row <= r.row2; row++) {
    out.push((rows[row - 1] ?? []).slice(r.col1 - 1, r.col2));
  }
  return { width: r.col2 - r.col1 + 1, height: r.row2 - r.row1 + 1, rows: out };
}

/** Paste a clip with its bottom-left cell at (row, col); parts outside the chart are dropped. */
export function pasteClip(
  rows: SymbolRows,
  registry: SymbolRegistry,
  clip: Clip,
  row: number,
  col: number,
  fill: string = DEFAULT_FILL,
): string[][] {
  const width = gridWidth(rows);
  const out = mutable(rows);
  for (let dr = 0; dr < clip.height; dr++) {
    const target = out[row - 1 + dr];
    const source = clip.rows[dr];
    if (!target || !source) continue;
    const c1 = Math.max(col, 1);
    const c2 = Math.min(col + clip.width - 1, width);
    if (c1 > c2) continue;
    // Clear overlapped symbols first (also those sticking out on either side).
    const original = rows[row - 1 + dr] ?? [];
    const from = anchorAt(rows, row + dr, c1);
    let to = c2;
    while (to < width && original[to] === CONTINUATION) to += 1;
    for (let c = from; c <= to; c++) target[c - 1] = fill;
    for (let c = c1; c <= c2; c++) target[c - 1] = source[c - col] ?? fill;
  }
  return repairRows(out, registry, fill);
}

/**
 * The symbol that looks like `id` in a mirror: crossings swap direction, left- and right-leaning
 * decreases and increases swap. Symmetric and custom symbols stay the same.
 */
const MIRROR_PAIRS: readonly (readonly [string, string])[] = [
  [STD.k2tog, STD.ssk],
  [STD.p2tog, STD.ssp],
  [STD.m1l, STD.m1r],
  ['cable:1-1-rc', 'cable:1-1-lc'],
  ['cable:1-1-rpc', 'cable:1-1-lpc'],
  ['cable:2-1-rc', 'cable:2-1-lc'],
  ['cable:2-1-rpc', 'cable:2-1-lpc'],
  ['cable:2-2-rc', 'cable:2-2-lc'],
  ['cable:2-2-rpc', 'cable:2-2-lpc'],
];
const MIRROR = new Map<string, string>(
  MIRROR_PAIRS.flatMap(([a, b]) => [[a, b] as const, [b, a] as const]),
);

export function mirrorSymbolId(id: string): string {
  return MIRROR.get(id) ?? id;
}

/**
 * Mirror a rectangle. `horizontal` swaps left and right (and each symbol for its mirror image),
 * `vertical` swaps bottom and top rows.
 */
export function mirrorRect(
  rows: SymbolRows,
  registry: SymbolRegistry,
  rect: CellRect,
  axis: 'horizontal' | 'vertical',
  fill: string = DEFAULT_FILL,
): string[][] {
  const r = snapRect(rows, registry, rect);
  const out = mutable(rows);
  if (axis === 'vertical') {
    for (let k = 0; k <= r.row2 - r.row1; k++) {
      const src = rows[r.row2 - 1 - k];
      const target = out[r.row1 - 1 + k];
      if (!src || !target) continue;
      for (let c = r.col1; c <= r.col2; c++) target[c - 1] = src[c - 1] ?? fill;
    }
    return repairRows(out, registry, fill);
  }
  for (let row = r.row1; row <= r.row2; row++) {
    const target = out[row - 1];
    const src = rows[row - 1];
    if (!target || !src) continue;
    // Walk symbols right to left and write them left to right.
    let write = r.col1;
    let c = r.col2;
    while (c >= r.col1) {
      const a = anchorAt(rows, row, c);
      const id = src[a - 1] ?? fill;
      const w = c - a + 1;
      target[write - 1] = mirrorSymbolId(id);
      for (let k = 1; k < w; k++) target[write - 1 + k] = CONTINUATION;
      write += w;
      c = a - 1;
    }
  }
  return repairRows(out, registry, fill);
}

export interface ResizeAnchor {
  readonly x: 'left' | 'right';
  readonly y: 'bottom' | 'top';
}

/**
 * Resize the chart. The anchor says which edges stay put: `x: 'right'` adds or removes columns on
 * the left, `y: 'bottom'` adds or removes rows at the top (the usual case, since row 1 is worked
 * first). New cells get `fill`.
 */
export function resizeRows(
  rows: SymbolRows,
  registry: SymbolRegistry,
  width: number,
  height: number,
  anchor: ResizeAnchor = { x: 'left', y: 'bottom' },
  fill: string = DEFAULT_FILL,
): string[][] {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const oldW = gridWidth(rows);
  const blankRow = () => Array<string>(w).fill(fill);
  const fitRow = (row: readonly string[]): string[] => {
    if (anchor.x === 'left') {
      return row.length >= w
        ? row.slice(0, w)
        : [...row, ...Array<string>(w - row.length).fill(fill)];
    }
    return row.length >= w
      ? row.slice(row.length - w)
      : [...Array<string>(w - row.length).fill(fill), ...row];
  };
  let out = rows.map(fitRow);
  if (oldW === 0) out = rows.map(() => blankRow());
  if (out.length > h) out = anchor.y === 'bottom' ? out.slice(0, h) : out.slice(out.length - h);
  while (out.length < h) {
    if (anchor.y === 'bottom') out.push(blankRow());
    else out.unshift(blankRow());
  }
  return repairRows(out, registry, fill);
}

/** Insert `count` rows of `fill` above row `after` (0 = below row 1). */
export function insertRows(
  rows: SymbolRows,
  after: number,
  count = 1,
  fill: string = DEFAULT_FILL,
): string[][] {
  const w = gridWidth(rows);
  const at = clamp(after, 0, rows.length);
  const added = Array.from({ length: count }, () => Array<string>(w).fill(fill));
  return [...mutable(rows.slice(0, at)), ...added, ...mutable(rows.slice(at))];
}

/** Delete rows row1…row2 (keeps at least one row). */
export function deleteRows(rows: SymbolRows, row1: number, row2: number): string[][] {
  const a = clamp(Math.min(row1, row2), 1, rows.length);
  const b = clamp(Math.max(row1, row2), 1, rows.length);
  if (b - a + 1 >= rows.length) return mutable(rows.slice(0, 1));
  return mutable([...rows.slice(0, a - 1), ...rows.slice(b)]);
}

/** Insert `count` columns of `fill` to the right of column `after` (0 = before column 1). */
export function insertColumns(
  rows: SymbolRows,
  registry: SymbolRegistry,
  after: number,
  count = 1,
  fill: string = DEFAULT_FILL,
): string[][] {
  const at = clamp(after, 0, gridWidth(rows));
  const out = rows.map((r) => [
    ...r.slice(0, at),
    ...Array<string>(count).fill(fill),
    ...r.slice(at),
  ]);
  return repairRows(out, registry, fill);
}

/** Delete columns col1…col2 (keeps at least one column). Symbols cut by the edges become `fill`. */
export function deleteColumns(
  rows: SymbolRows,
  registry: SymbolRegistry,
  col1: number,
  col2: number,
  fill: string = DEFAULT_FILL,
): string[][] {
  const w = gridWidth(rows);
  const a = clamp(Math.min(col1, col2), 1, w);
  const b = clamp(Math.max(col1, col2), 1, w);
  if (b - a + 1 >= w)
    return repairRows(
      rows.map((r) => r.slice(0, 1)),
      registry,
      fill,
    );
  return repairRows(
    rows.map((r) => [...r.slice(0, a - 1), ...r.slice(b)]),
    registry,
    fill,
  );
}

/** Symbols used in a grid, most frequent first. */
export function symbolUsage(rows: SymbolRows): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const id of row) if (id !== CONTINUATION) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]));
}
