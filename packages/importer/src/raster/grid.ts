import { binarize, type GrayImage } from './gray';

/**
 * Chart grid detection on a raster image (ADR-5, raster recognizer step 1).
 *
 * 1. Ink mask, then masks of long horizontal and long vertical ink runs (cell rules are long,
 *    symbol strokes and text are not).
 * 2. Connected groups of rule pixels are grid candidates (several charts per image are common).
 * 3. Per candidate, rule positions come from per-column / per-row coverage. The grid is the
 *    longest run of evenly spaced rules; cells must be square (same pitch on both axes), which
 *    rejects frames, brackets and sketches.
 */
export interface DetectedGrid {
  /** x of each vertical rule, left → right (cols + 1 values), in image pixels. */
  readonly xs: readonly number[];
  /** y of each horizontal rule, top → bottom (rows + 1 values). */
  readonly ys: readonly number[];
  readonly cols: number;
  readonly rows: number;
  /** Cell size in pixels. */
  readonly pitch: number;
  /** Bounding box of the grid. */
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** How regular the lattice is (0…1): 1 = every rule exactly where expected. */
  readonly regularity: number;
}

export interface GridOptions {
  /** Ink mask method: global (prints, screenshots) or local (photos). */
  readonly threshold?: 'global' | 'local';
  /** Smallest cell size to accept, in pixels. */
  readonly minPitch?: number;
  /** Shortest run that counts as a rule, in pixels. */
  readonly minRun?: number;
}

function runMask(
  ink: Uint8Array,
  w: number,
  h: number,
  minRun: number,
  horizontal: boolean,
): Uint8Array {
  const out = new Uint8Array(w * h);
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const idx = (o: number, i: number) => (horizontal ? o * w + i : i * w + o);
  for (let o = 0; o < outer; o++) {
    let start = -1;
    for (let i = 0; i <= inner; i++) {
      const on = i < inner && ink[idx(o, i)] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start >= minRun) for (let k = start; k < i; k++) out[idx(o, k)] = 1;
        start = -1;
      }
    }
  }
  return out;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

/** Bounding boxes of 8-connected components of a mask. */
function components(mask: Uint8Array, w: number, h: number): Box[] {
  const label = new Int32Array(w * h).fill(-1);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || label[start] !== -1) continue;
    const id = boxes.length;
    const box: Box = { x0: w, y0: h, x1: -1, y1: -1, n: 0 };
    boxes.push(box);
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() ?? 0;
      const x = p % w;
      const y = (p - x) / w;
      box.n += 1;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] === 1 && label[q] === -1) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
  }
  return boxes;
}

/** Group neighbouring indices whose coverage passes `min` into rule centres (thick rules → one). */
function peaks(coverage: readonly number[], min: number, offset: number): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < coverage.length) {
    if ((coverage[i] ?? 0) < min) {
      i += 1;
      continue;
    }
    let j = i;
    let wsum = 0;
    let csum = 0;
    while (j < coverage.length && (coverage[j] ?? 0) >= min) {
      wsum += coverage[j] ?? 0;
      csum += (coverage[j] ?? 0) * j;
      j += 1;
    }
    out.push(offset + csum / wsum);
    i = j;
  }
  return out;
}

/**
 * The longest run of positions with consecutive gaps close to one common pitch. Candidate pitches
 * come from the gaps themselves; small gaps (double-printed rules) are merged first.
 */
function regularRun(
  pos: readonly number[],
  minPitch: number,
): { run: number[]; pitch: number; regularity: number } {
  const merged: number[] = [];
  for (const p of pos) {
    const last = merged[merged.length - 1];
    if (last !== undefined && p - last < minPitch * 0.6) merged[merged.length - 1] = (last + p) / 2;
    else merged.push(p);
  }
  let best = { run: [] as number[], pitch: 0, regularity: 0 };
  const gaps = merged.slice(1).map((p, i) => p - (merged[i] ?? 0));
  const candidates = [
    ...new Set(gaps.filter((g) => g >= minPitch).map((g) => Math.round(g * 4) / 4)),
  ];
  for (const pitch of candidates) {
    const tol = Math.max(1.2, pitch * 0.18);
    let start = 0;
    for (let i = 1; i <= merged.length; i++) {
      const g = i < merged.length ? (merged[i] ?? 0) - (merged[i - 1] ?? 0) : Infinity;
      if (Math.abs(g - pitch) <= tol) continue;
      const run = merged.slice(start, i);
      if (
        run.length > best.run.length ||
        (run.length === best.run.length && run.length > 1 && pitch < best.pitch)
      ) {
        const p = ((run[run.length - 1] ?? 0) - (run[0] ?? 0)) / Math.max(1, run.length - 1);
        const err =
          run.reduce((s, x, k) => s + Math.abs(x - ((run[0] ?? 0) + k * p)), 0) / run.length;
        best = { run, pitch: p, regularity: Math.max(0, 1 - err / Math.max(1, p * 0.25)) };
      }
      start = i;
    }
  }
  return best;
}

/** Find chart grids in an image. */
export function detectGrids(img: GrayImage, options: GridOptions = {}): DetectedGrid[] {
  const { width: w, height: h } = img;
  const minPitch = options.minPitch ?? 5;
  const minRun = options.minRun ?? Math.max(12, Math.round(minPitch * 2.4));
  const ink = binarize(img, options.threshold ?? 'global');
  const hm = runMask(ink, w, h, minRun, true);
  const vm = runMask(ink, w, h, minRun, false);
  const rules = new Uint8Array(w * h);
  for (let i = 0; i < rules.length; i++) rules[i] = (hm[i] ?? 0) | (vm[i] ?? 0);

  const out: DetectedGrid[] = [];
  for (const b of components(rules, w, h)) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (bw < minPitch * 2 || bh < minPitch * 2) continue;
    // Vertical rule positions: columns with many vertical-run pixels inside the box.
    const vcov: number[] = [];
    for (let x = b.x0; x <= b.x1; x++) {
      let n = 0;
      for (let y = b.y0; y <= b.y1; y++) n += vm[y * w + x] ?? 0;
      vcov.push(n);
    }
    const vmax = Math.max(...vcov);
    if (vmax < minPitch * 2) continue;
    const xsAll = peaks(vcov, vmax * 0.45, b.x0);
    const vx = regularRun(xsAll, minPitch);
    if (vx.run.length < 2) continue;
    const left = vx.run[0] ?? b.x0;
    const right = vx.run[vx.run.length - 1] ?? b.x1;
    // Horizontal rule positions, measured between the outer vertical rules.
    const hcov: number[] = [];
    for (let y = b.y0; y <= b.y1; y++) {
      let n = 0;
      for (let x = Math.floor(left); x <= Math.ceil(right); x++) n += hm[y * w + x] ?? 0;
      hcov.push(n);
    }
    const span = right - left + 1;
    const ysAll = peaks(hcov, span * 0.55, b.y0);
    const hy = regularRun(ysAll, minPitch);
    if (hy.run.length < 2) continue;
    // Square cells: both pitches must agree.
    if (Math.abs(vx.pitch - hy.pitch) > Math.max(1.5, 0.15 * Math.max(vx.pitch, hy.pitch)))
      continue;
    const top = hy.run[0] ?? 0;
    const bottom = hy.run[hy.run.length - 1] ?? 0;
    // The vertical rules must actually cover the rows found (not a frame beside the grid).
    out.push({
      xs: vx.run,
      ys: hy.run,
      cols: vx.run.length - 1,
      rows: hy.run.length - 1,
      pitch: (vx.pitch + hy.pitch) / 2,
      box: { x: left, y: top, w: right - left, h: bottom - top },
      regularity: Math.min(vx.regularity, hy.regularity),
    });
  }
  // Reading order: top to bottom, then left to right.
  return out.sort((a, b) =>
    Math.abs(a.box.y - b.box.y) > a.pitch * 2 ? a.box.y - b.box.y : a.box.x - b.box.x,
  );
}
