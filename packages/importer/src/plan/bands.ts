/**
 * Bands of a chart drawn in steps (a yoke): rows of one width worked over one stitch count. A new
 * band starts after a row marked by an arrow (stitches were increased in it) and where the width
 * jumps by two or more columns (the next motif). A change of one column is an increase inside the
 * chart (its repeat grows), not a new band.
 */
export interface ChartBand {
  /** First and last chart row (1 = bottom), inclusive. */
  readonly from: number;
  readonly to: number;
  /** Leftmost and rightmost column with stitches (0 = left in the RS view), inclusive. */
  readonly left: number;
  readonly right: number;
  /** The band's last row has an arrow: stitches are increased (or decreased) evenly in it. */
  readonly arrow: boolean;
}

const NONE = 'std:none';

/** Columns with stitches in a row; null for a row without any. */
function extent(row: readonly (string | null)[]): { left: number; right: number } | null {
  let left = -1;
  let right = -1;
  row.forEach((id, c) => {
    if (id !== NONE && id !== null) {
      if (left < 0) left = c;
      right = c;
    }
  });
  return left < 0 ? null : { left, right };
}

/**
 * The bands of a chart, bottom up. `rows`: symbol ids, row 1 first, `std:none` where the chart has
 * no stitch; `arrows`: rows marked beside the chart. A rectangle without arrows is one band.
 */
export function chartBands(
  rows: readonly (readonly (string | null)[])[],
  arrows: readonly number[] = [],
): ChartBand[] {
  const out: ChartBand[] = [];
  let cur: { from: number; left: number; right: number } | null = null;
  const close = (to: number, arrow: boolean) => {
    if (cur) out.push({ from: cur.from, to, left: cur.left, right: cur.right, arrow });
    cur = null;
  };
  rows.forEach((row, i) => {
    const r = i + 1;
    const e = extent(row);
    if (!e) {
      close(r - 1, false);
      return;
    }
    if (cur) {
      const jump = Math.abs(e.left - cur.left) + Math.abs(e.right - cur.right);
      if (jump >= 2) close(r - 1, false);
      else {
        // An increase inside the chart: the band spans both widths.
        cur.left = Math.min(cur.left, e.left);
        cur.right = Math.max(cur.right, e.right);
      }
    }
    cur ??= { from: r, left: e.left, right: e.right };
    if (arrows.includes(r)) close(r, true);
  });
  close(rows.length, false);
  return out;
}

/** The band's own cells: rows `from`…`to`, columns `left`…`right` (row 1 of the band first). */
export function bandRows<T>(rows: readonly (readonly T[])[], band: ChartBand): T[][] {
  return rows.slice(band.from - 1, band.to).map((row) => row.slice(band.left, band.right + 1));
}
