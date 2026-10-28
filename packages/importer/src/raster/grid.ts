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
  /**
   * A chart that is not a rectangle (wider at the top, in steps): `missing[row][col]` (rows top →
   * bottom) is true where the lattice has no cell. Absent when every cell is there.
   */
  readonly missing?: readonly (readonly boolean[])[];
}

export interface GridOptions {
  /** Ink mask method: global (prints, screenshots) or local (photos). */
  /**
   * `ridge`: rules are found as thin lines darker than both sides, so they show between cells
   * filled with a colour (colourwork printed in colour), where every cell is "ink".
   */
  readonly threshold?: 'global' | 'local' | 'ridge';
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

/**
 * A regular run of rules continued on both sides over weaker rules: each next one must sit one
 * pitch further (within the run's tolerance), so marks inside cells never join.
 */
function extend(run: readonly number[], weak: readonly number[], pitch: number): number[] {
  const out = [...run];
  const tol = Math.max(1.2, pitch * 0.18);
  const near = (x: number) => weak.find((p) => Math.abs(p - x) <= tol);
  for (;;) {
    const last = out[out.length - 1];
    const p = last === undefined ? undefined : near(last + pitch);
    if (p === undefined) break;
    out.push(p);
  }
  for (;;) {
    const first = out[0];
    const p = first === undefined ? undefined : near(first - pitch);
    if (p === undefined) break;
    out.unshift(p);
  }
  return out;
}

/** Share of the pixels along a rule (±1 px across it) that belong to the rule mask. */
function edge(
  mask: Uint8Array,
  w: number,
  h: number,
  horizontal: boolean,
  at: number,
  from: number,
  to: number,
): number {
  const a = Math.round(from + (to - from) * 0.15);
  const b = Math.round(to - (to - from) * 0.15);
  let on = 0;
  let n = 0;
  for (let t = a; t <= b; t++) {
    n += 1;
    for (let d = -1; d <= 1; d++) {
      const p = Math.round(at) + d;
      const x = horizontal ? t : p;
      const y = horizontal ? p : t;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (mask[y * w + x]) {
        on += 1;
        break;
      }
    }
  }
  return n ? on / n : 0;
}

/**
 * The cells of a lattice that are really there: top and bottom drawn. The lattice is cut to the
 * cells found; `missing` marks the holes of a chart that is not a rectangle. Null when too few
 * cells remain.
 */
function cellsOf(
  xsIn: readonly number[],
  ysIn: readonly number[],
  hm: Uint8Array,
  vm: Uint8Array,
  w: number,
  h: number,
): { xs: number[]; ys: number[]; missing: boolean[][] } | null {
  const cols = xsIn.length - 1;
  const rows = ysIn.length - 1;
  const here: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    const y0 = ysIn[r] ?? 0;
    const y1 = ysIn[r + 1] ?? y0;
    for (let c = 0; c < cols; c++) {
      const x0 = xsIn[c] ?? 0;
      const x1 = xsIn[c + 1] ?? x0;
      // Top and bottom drawn: a cell. (Not its sides: a cable spans cells without a rule between.)
      row.push(edge(hm, w, h, true, y0, x0, x1) >= 0.5 && edge(hm, w, h, true, y1, x0, x1) >= 0.5);
    }
    here.push(row);
  }
  // A bracket under a chart ("⌊ 4 ⌋": the repeat) makes a row of a few loose "cells": a chart's
  // first and last rows are one unbroken run of cells — a single cell only with both sides drawn
  // (a chart one stitch wide).
  const band = (row: readonly boolean[] | undefined, r: number) => {
    if (!row) return false;
    const first = row.indexOf(true);
    const last = row.lastIndexOf(true);
    if (first < 0 || !row.slice(first, last + 1).every(Boolean)) return false;
    if (last > first) return true;
    const y0 = ysIn[r] ?? 0;
    const y1 = ysIn[r + 1] ?? y0;
    return (
      edge(vm, w, h, false, xsIn[first] ?? 0, y0, y1) >= 0.5 &&
      edge(vm, w, h, false, xsIn[first + 1] ?? 0, y0, y1) >= 0.5
    );
  };
  const anyBand = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (band(here[i], i)) return true;
    return false;
  };
  const empty = (row: readonly boolean[] | undefined) => !row?.some(Boolean);
  const clear = (i: number) => {
    here[i] = (here[i] ?? []).map(() => false);
  };
  let bottom = here.length - 1;
  for (;;) {
    while (bottom >= 0 && empty(here[bottom])) bottom -= 1;
    if (bottom < 0 || band(here[bottom], bottom) || !anyBand(0, bottom)) break;
    clear(bottom);
  }
  let top = 0;
  for (;;) {
    while (top < here.length && empty(here[top])) top += 1;
    if (top >= here.length || band(here[top], top) || !anyBand(top + 1, here.length)) break;
    clear(top);
  }
  let r0 = rows;
  let r1 = -1;
  let c0 = cols;
  let c1 = -1;
  let count = 0;
  here.forEach((row, r) =>
    row.forEach((on, c) => {
      if (!on) return;
      count += 1;
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
    }),
  );
  if (count < 4 || r1 < r0 || c1 < c0) return null;
  // A chart's cells fill most of its box; scattered "cells" are not a chart.
  if (count < (r1 - r0 + 1) * (c1 - c0 + 1) * 0.3) return null;
  return {
    xs: xsIn.slice(c0, c1 + 2),
    ys: ysIn.slice(r0, r1 + 2),
    missing: here.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1).map((on) => !on)),
  };
}

/**
 * Pixels on a thin dark line: darker than the pixels a few steps above and below it (horizontal
 * lines) or left and right of it (vertical ones).
 */
function ridges(img: GrayImage, horizontal: boolean): Uint8Array {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  const g = (x: number, y: number) =>
    data[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] ?? 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g(x, y);
      let best = 0;
      for (const d of [2, 3]) {
        const a = horizontal ? g(x, y - d) : g(x - d, y);
        const b = horizontal ? g(x, y + d) : g(x + d, y);
        best = Math.max(best, Math.min(a, b) - v);
      }
      if (best >= 25) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Find chart grids in an image. */
export function detectGrids(img: GrayImage, options: GridOptions = {}): DetectedGrid[] {
  const { width: w, height: h } = img;
  const minPitch = options.minPitch ?? 5;
  const minRun = options.minRun ?? Math.max(12, Math.round(minPitch * 2.4));
  const mode = options.threshold ?? 'global';
  const ink = mode === 'ridge' ? null : binarize(img, mode);
  const hm = runMask(ink ?? ridges(img, true), w, h, minRun, true);
  const vm = runMask(ink ?? ridges(img, false), w, h, minRun, false);
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
    const strictX = regularRun(xsAll, minPitch);
    if (strictX.run.length < 2) continue;
    // A chart in steps (wider at the top) has shorter rules where it is narrow: the lattice goes on
    // over weaker rules found one pitch further each time; which cells exist is decided below.
    const vx = {
      ...strictX,
      run: extend(
        strictX.run,
        peaks(vcov, Math.max(minPitch * 1.5, vmax * 0.1), b.x0),
        strictX.pitch,
      ),
    };
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
    const hmax = Math.max(...hcov);
    const strictY = regularRun(peaks(hcov, Math.min(span * 0.55, hmax * 0.9), b.y0), minPitch);
    if (strictY.run.length < 2) continue;
    const hy = {
      ...strictY,
      run: extend(
        strictY.run,
        peaks(hcov, Math.max(minPitch * 1.5, hmax * 0.1), b.y0),
        strictY.pitch,
      ),
    };
    // Square cells: both pitches must agree.
    if (Math.abs(vx.pitch - hy.pitch) > Math.max(1.5, 0.15 * Math.max(vx.pitch, hy.pitch)))
      continue;
    // A rectangle (no rule beyond the strong ones): every cell is there, as drawn. Otherwise only
    // the cells really drawn count.
    const stepped = vx.run.length > strictX.run.length || hy.run.length > strictY.run.length;
    const lattice = stepped
      ? cellsOf(vx.run, hy.run, hm, vm, w, h)
      : { xs: [...vx.run], ys: [...hy.run], missing: [] as boolean[][] };
    if (!lattice) continue;
    const { xs, ys, missing } = lattice;
    out.push({
      xs,
      ys,
      cols: xs.length - 1,
      rows: ys.length - 1,
      pitch: (vx.pitch + hy.pitch) / 2,
      box: {
        x: xs[0] ?? left,
        y: ys[0] ?? 0,
        w: (xs[xs.length - 1] ?? right) - (xs[0] ?? left),
        h: (ys[ys.length - 1] ?? 0) - (ys[0] ?? 0),
      },
      regularity: Math.min(vx.regularity, hy.regularity),
      ...(missing.some((r) => r.some(Boolean)) ? { missing } : {}),
    });
  }
  // Reading order: top to bottom, then left to right.
  return out.sort((a, b) =>
    Math.abs(a.box.y - b.box.y) > a.pitch * 2 ? a.box.y - b.box.y : a.box.x - b.box.x,
  );
}
