/**
 * Greyscale images for recognition: one byte per pixel, 0 = black ink, 255 = white paper.
 * Pure TypeScript (no canvas), so the same code runs in a Web Worker, in Node tests and on any
 * browser.
 */
export interface GrayImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export function createGray(width: number, height: number, fill = 255): GrayImage {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  return { width: w, height: h, data: new Uint8Array(w * h).fill(fill) };
}

/**
 * Convert RGBA (or RGB / grey, by `channels`) pixels to grey with ITU-R BT.601 weights.
 * Transparent pixels count as white paper.
 */
export function toGray(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3 | 4 = 4,
): GrayImage {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += channels) {
    if (channels === 1) {
      out[i] = pixels[p] ?? 255;
      continue;
    }
    const r = pixels[p] ?? 255;
    const g = pixels[p + 1] ?? 255;
    const b = pixels[p + 2] ?? 255;
    let v = 0.299 * r + 0.587 * g + 0.114 * b;
    if (channels === 4) {
      const a = (pixels[p + 3] ?? 255) / 255;
      v = v * a + 255 * (1 - a);
    }
    out[i] = Math.round(v);
  }
  return { width, height, data: out };
}

export const at = (img: GrayImage, x: number, y: number): number =>
  x < 0 || y < 0 || x >= img.width || y >= img.height ? 255 : (img.data[y * img.width + x] ?? 255);

/** Bilinear sample at a fractional position (outside the image = paper). */
export function sample(img: GrayImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = at(img, x0, y0);
  const b = at(img, x0 + 1, y0);
  const c = at(img, x0, y0 + 1);
  const d = at(img, x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/**
 * Resample the source rectangle (x, y, w, h; fractional allowed) to `outW × outH`. Shrinking
 * averages over the covered area (box filter), so thin lines don't vanish.
 */
export function resample(
  img: GrayImage,
  x: number,
  y: number,
  w: number,
  h: number,
  outW: number,
  outH: number,
): GrayImage {
  const out = createGray(outW, outH);
  const sx = w / outW;
  const sy = h / outH;
  // Sub-samples per output pixel: enough to cover the source footprint.
  const nx = Math.max(1, Math.min(6, Math.ceil(sx)));
  const ny = Math.max(1, Math.min(6, Math.ceil(sy)));
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let sum = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          sum += sample(
            img,
            x + (ox + (i + 0.5) / nx) * sx - 0.5,
            y + (oy + (j + 0.5) / ny) * sy - 0.5,
          );
        }
      }
      out.data[oy * outW + ox] = Math.round(sum / (nx * ny));
    }
  }
  return out;
}

export function crop(img: GrayImage, x: number, y: number, w: number, h: number): GrayImage {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.ceil(x + w));
  const y1 = Math.min(img.height, Math.ceil(y + h));
  const out = createGray(x1 - x0, y1 - y0);
  for (let yy = y0; yy < y1; yy++) {
    out.data.set(
      img.data.subarray(yy * img.width + x0, yy * img.width + x1),
      (yy - y0) * out.width,
    );
  }
  return out;
}

/** Otsu's global threshold: the grey level that best separates ink from paper. */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of img.data) hist[v] = (hist[v] ?? 0) + 1;
  const total = img.data.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Ink mask: 1 where the pixel is ink. Clean prints use Otsu's global threshold; photos with
 * uneven light use a local (Sauvola-style) threshold over a window of `window` pixels.
 */
export function binarize(
  img: GrayImage,
  mode: 'global' | 'local' = 'global',
  window = 31,
): Uint8Array {
  const out = new Uint8Array(img.width * img.height);
  if (mode === 'global') {
    // Never call near-white paper ink, even on a blank page.
    const t = Math.min(otsuThreshold(img), 200);
    for (let i = 0; i < out.length; i++) out[i] = (img.data[i] ?? 255) <= t ? 1 : 0;
    return out;
  }
  const { width: w, height: h } = img;
  // Integral images of values and squares for O(1) window statistics.
  const sum = new Float64Array((w + 1) * (h + 1));
  const sq = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < w; x++) {
      const v = img.data[y * w + x] ?? 255;
      rs += v;
      rq += v * v;
      sum[(y + 1) * (w + 1) + x + 1] = (sum[y * (w + 1) + x + 1] ?? 0) + rs;
      sq[(y + 1) * (w + 1) + x + 1] = (sq[y * (w + 1) + x + 1] ?? 0) + rq;
    }
  }
  const r = Math.floor(window / 2);
  const k = 0.2;
  const R = 128;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const n = (x1 - x0) * (y1 - y0);
      const s =
        (sum[y1 * (w + 1) + x1] ?? 0) -
        (sum[y0 * (w + 1) + x1] ?? 0) -
        (sum[y1 * (w + 1) + x0] ?? 0) +
        (sum[y0 * (w + 1) + x0] ?? 0);
      const q =
        (sq[y1 * (w + 1) + x1] ?? 0) -
        (sq[y0 * (w + 1) + x1] ?? 0) -
        (sq[y1 * (w + 1) + x0] ?? 0) +
        (sq[y0 * (w + 1) + x0] ?? 0);
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, q / n - mean * mean));
      const t = mean * (1 + k * (sd / R - 1));
      out[y * w + x] =
        (img.data[y * w + x] ?? 255) < t && (img.data[y * w + x] ?? 255) < 215 ? 1 : 0;
    }
  }
  return out;
}

/** Mean grey value: a quick way to tell light photos from clean prints. */
export function meanGray(img: GrayImage): number {
  let s = 0;
  for (const v of img.data) s += v;
  return img.data.length ? s / img.data.length : 255;
}
