import { createGray, sample, type GrayImage } from './gray';

/**
 * Crop & straighten (ADR-5): map a quadrilateral in a photo (four corners the user drags) onto an
 * upright rectangle with a homography.
 */
export type Point = readonly [number, number];

/** 3×3 homography as 9 numbers, row-major; maps (x, y, 1). */
export type Homography = readonly number[];

/** Solve the 8×8 linear system with Gaussian elimination (partial pivoting). */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]?.[col] ?? 0) > Math.abs(m[piv]?.[col] ?? 0)) piv = r;
    const p = m[piv];
    if (!p || Math.abs(p[col] ?? 0) < 1e-12) return null;
    [m[col], m[piv]] = [p, m[col] ?? p];
    const row = m[col] ?? p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const target = m[r];
      if (!target) continue;
      const f = (target[col] ?? 0) / (row[col] ?? 1);
      for (let k = col; k <= n; k++) target[k] = (target[k] ?? 0) - f * (row[k] ?? 0);
    }
  }
  return m.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1));
}

/** Homography that maps each `from[i]` to `to[i]` (4 point pairs). */
export function homography(from: readonly Point[], to: readonly Point[]): Homography | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i] ?? [0, 0];
    const [u, v] = to[i] ?? [0, 0];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

export function project(h: Homography, x: number, y: number): [number, number] {
  const w = (h[6] ?? 0) * x + (h[7] ?? 0) * y + (h[8] ?? 1);
  return [
    ((h[0] ?? 0) * x + (h[1] ?? 0) * y + (h[2] ?? 0)) / w,
    ((h[3] ?? 0) * x + (h[4] ?? 0) * y + (h[5] ?? 0)) / w,
  ];
}

/**
 * Straighten the quadrilateral `corners` (top-left, top-right, bottom-right, bottom-left) into an
 * upright image. The output size follows the longer opposite edges, capped at `maxSide`.
 */
export function straighten(img: GrayImage, corners: readonly Point[], maxSide = 2400): GrayImage {
  const [tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0]] = corners;
  const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  // Map output → source (inverse warp), so every output pixel is sampled once.
  const inv = homography(
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    [tl, tr, br, bl],
  );
  const out = createGray(w, h);
  if (!inv) return out;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = project(inv, x + 0.5, y + 0.5);
      out.data[y * w + x] = Math.round(sample(img, sx - 0.5, sy - 0.5));
    }
  }
  return out;
}
