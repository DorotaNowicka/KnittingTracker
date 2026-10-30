import type { GrayImage } from './gray';
import type { DetectedGrid } from './grid';

/**
 * Arrows beside a chart ("← 3"): they mark the rounds where stitches are increased (or decreased)
 * evenly — between bands of a yoke, say. An arrow is a thin horizontal stroke, longer than a cell,
 * to the right of the row it points at. The number next to it is not read: arrows are numbered in
 * the order they are worked.
 */

const INK = 140;

/** Right edge (x) of the cells of a grid row (rows top → bottom); a stepped chart may be narrower. */
function rowRight(grid: DetectedGrid, r: number): number {
  const missing = grid.missing?.[r];
  let last = grid.cols - 1;
  while (missing && last > 0 && missing[last]) last -= 1;
  return grid.xs[last + 1] ?? grid.box.x + grid.box.w;
}

/** Longest run of ink on line `y` between `x0` and `x1`, with where it starts. */
function longestRun(img: GrayImage, y: number, x0: number, x1: number) {
  let best = 0;
  let at = -1;
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    const on = x < x1 && (img.data[y * img.width + x] ?? 255) < INK;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start > best) {
        best = x - start;
        at = start;
      }
      start = -1;
    }
  }
  return { length: best, at };
}

/**
 * Chart rows (1 = bottom) that have an arrow beside them, on the right of the chart. `others`: the
 * other grids of the same image, whose rules must not be taken for arrows.
 */
export function findArrows(
  img: GrayImage,
  grid: DetectedGrid,
  others: readonly DetectedGrid[] = [],
): number[] {
  const p = grid.pitch;
  const right = grid.box.x + grid.box.w;
  const found: { row: number; length: number }[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const top = grid.ys[r] ?? 0;
    const bottom = grid.ys[r + 1] ?? top + p;
    // The area right of the row, up to the next chart on the same height.
    let x1 = Math.min(img.width, Math.round(right + p * 7));
    for (const o of others) {
      if (o === grid) continue;
      const overlaps = o.box.y < bottom && o.box.y + o.box.h > top;
      if (overlaps && o.box.x >= right) x1 = Math.min(x1, Math.round(o.box.x - 1));
    }
    const x0 = Math.round(rowRight(grid, r) + p * 0.25);
    if (x1 - x0 < p * 1.5) continue;
    let best = { length: 0, at: -1, y: 0 };
    for (let y = Math.round(top + p * 0.2); y < bottom - p * 0.2; y++) {
      const run = longestRun(img, y, x0, x1);
      if (run.length > best.length) best = { ...run, y };
    }
    if (best.length < p * 1.3 || best.length > p * 6) continue;
    // A shaft is thin: paper just above and below its middle (not a block, a frame or text).
    const mid = Math.round(best.at + best.length * 0.6);
    const off = Math.max(2, Math.round(p * 0.3));
    const above = img.data[(best.y - off) * img.width + mid] ?? 255;
    const below = img.data[(best.y + off) * img.width + mid] ?? 255;
    if (above < INK || below < INK) continue;
    found.push({ row: grid.rows - r, length: best.length });
  }
  // One arrow lit up two neighbouring rows (drawn on their line): keep the stronger.
  const rows = found
    .filter((f) => {
      const twin = found.find((g) => Math.abs(g.row - f.row) === 1);
      return !twin || twin.length < f.length || (twin.length === f.length && twin.row < f.row);
    })
    .map((f) => f.row);
  return rows.sort((a, b) => a - b);
}
