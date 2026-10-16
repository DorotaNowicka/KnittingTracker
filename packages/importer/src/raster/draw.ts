import type { Glyph, GlyphPrimitive } from '@kt/core';
import { createGray, type GrayImage } from './gray';

/**
 * A tiny anti-aliased software rasterizer for glyph primitives (DR-11: the same glyphs as the
 * grid). It renders recognizer templates and the synthetic test charts, without a canvas, so it
 * works inside a worker and in Node.
 */

export interface DrawnSymbol {
  /** 1-based grid position of the symbol's leftmost cell (row 1 = bottom). */
  readonly row: number;
  readonly col: number;
  readonly width: number;
  readonly glyph: Glyph;
  /** Shade the cells ("no stitch"). */
  readonly shaded?: boolean;
}

export interface RenderSpec {
  readonly cols: number;
  readonly rows: number;
  /** Cell size in output pixels. */
  readonly cell: number;
  readonly symbols: readonly DrawnSymbol[];
  /** Draw cell rules (thin) and the outer frame. Default true. */
  readonly grid?: boolean;
  /** Margin around the grid in pixels. Default 0. */
  readonly margin?: number;
  /** Glyph stroke width in pixels. Default: a tenth of the cell, at least 1.2. */
  readonly stroke?: number;
  /** Rule width in pixels. Default 1. */
  readonly rule?: number;
  /** Grey value of the rules (0 = black). Default 90. */
  readonly ruleGray?: number;
}

const SS = 4; // supersampling factor per axis

type Cov = Float32Array;

function stamp(
  cov: Cov,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inside: (x: number, y: number) => boolean,
) {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(w - 1, Math.ceil(x1));
  const yb = Math.min(h - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) if (inside(x + 0.5, y + 0.5)) cov[y * w + x] = 1;
  }
}

function capsule(
  cov: Cov,
  w: number,
  h: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  stamp(
    cov,
    w,
    h,
    Math.min(ax, bx) - r,
    Math.min(ay, by) - r,
    Math.max(ax, bx) + r,
    Math.max(ay, by) + r,
    (px, py) => {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const qx = ax + t * dx - px;
      const qy = ay + t * dy - py;
      return qx * qx + qy * qy <= r * r;
    },
  );
}

function polygon(cov: Cov, w: number, h: number, pts: readonly (readonly [number, number])[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  stamp(cov, w, h, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (px, py) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i] ?? [0, 0];
      const [xj, yj] = pts[j] ?? [0, 0];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

function drawPrimitive(
  cov: Cov,
  w: number,
  h: number,
  p: GlyphPrimitive,
  ox: number,
  oy: number,
  cell: number,
  stroke: number,
) {
  const X = (v: number) => ox + v * cell;
  const Y = (v: number) => oy + v * cell;
  const r = stroke / 2;
  switch (p.kind) {
    case 'line':
      capsule(cov, w, h, X(p.from[0]), Y(p.from[1]), X(p.to[0]), Y(p.to[1]), r);
      break;
    case 'polyline':
      for (let i = 1; i < p.points.length; i++) {
        const a = p.points[i - 1];
        const b = p.points[i];
        if (a && b) capsule(cov, w, h, X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), r);
      }
      break;
    case 'polygon':
      polygon(
        cov,
        w,
        h,
        p.points.map(([x, y]) => [X(x), Y(y)] as const),
      );
      break;
    case 'circle': {
      const cx = X(p.center[0]);
      const cy = Y(p.center[1]);
      const rr = p.radius * cell;
      if (p.fill === 'ink') {
        stamp(
          cov,
          w,
          h,
          cx - rr,
          cy - rr,
          cx + rr,
          cy + rr,
          (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= rr * rr,
        );
      } else {
        stamp(cov, w, h, cx - rr - r, cy - rr - r, cx + rr + r, cy + rr + r, (px, py) => {
          const d = Math.hypot(px - cx, py - cy);
          return Math.abs(d - rr) <= r;
        });
      }
      break;
    }
    case 'text': {
      // No fonts here: a text glyph is approximated by a blob of its size (enough for matching).
      const s = p.size * cell * 0.5;
      const cx = X(p.at[0]);
      const cy = Y(p.at[1]);
      const half = s * 0.5 * Math.max(1, p.text.length * 0.6);
      stamp(cov, w, h, cx - half, cy - s * 0.5, cx + half, cy + s * 0.5, () => true);
      break;
    }
  }
}

/** Render a grid of symbols. */
export function renderCells(spec: RenderSpec): GrayImage {
  const margin = spec.margin ?? 0;
  const outW = Math.round(spec.cols * spec.cell + 2 * margin);
  const outH = Math.round(spec.rows * spec.cell + 2 * margin);
  const W = outW * SS;
  const H = outH * SS;
  const ink = new Float32Array(W * H);
  const shade = new Float32Array(W * H);
  const rule = new Float32Array(W * H);
  const cell = spec.cell * SS;
  const m = margin * SS;
  const stroke = (spec.stroke ?? Math.max(1.2, spec.cell * 0.1)) * SS;
  const ruleW = (spec.rule ?? 1) * SS;
  const top = (row: number) => m + (spec.rows - row) * cell;

  for (const s of spec.symbols) {
    const ox = m + (s.col - 1) * cell;
    const oy = top(s.row);
    if (s.shaded) {
      stamp(shade, W, H, ox, oy, ox + s.width * cell, oy + cell, () => true);
      continue;
    }
    for (const p of s.glyph.primitives) {
      if (p.kind === 'polygon' && p.fill === 'muted') {
        polygon(
          shade,
          W,
          H,
          p.points.map(([x, y]) => [ox + x * cell, oy + y * cell] as const),
        );
      } else drawPrimitive(ink, W, H, p, ox, oy, cell, stroke);
    }
  }
  if (spec.grid ?? true) {
    const half = ruleW / 2;
    for (let c = 0; c <= spec.cols; c++) {
      const x = m + c * cell;
      stamp(rule, W, H, x - half, m - half, x + half, m + spec.rows * cell + half, () => true);
    }
    for (let r = 0; r <= spec.rows; r++) {
      const y = m + r * cell;
      stamp(rule, W, H, m - half, y - half, m + spec.cols * cell + half, y + half, () => true);
    }
  }

  // Downsample: average coverage per output pixel, then compose paper < shade < rule < ink.
  const out = createGray(outW, outH);
  const ruleGray = spec.ruleGray ?? 90;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let ci = 0;
      let cs = 0;
      let cr = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const k = (y * SS + j) * W + x * SS + i;
          const vi = ink[k] ?? 0;
          const vr = (rule[k] ?? 0) * (1 - vi);
          ci += vi;
          cr += vr;
          cs += (shade[k] ?? 0) * (1 - vi) * (1 - (rule[k] ?? 0));
        }
      }
      const n = SS * SS;
      const v = 255 - (ci / n) * 255 - (cr / n) * (255 - ruleGray) - (cs / n) * 55;
      out.data[y * outW + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

/**
 * Rasterize vector page content (stroked segments and filled polygons, in points) into a grey
 * image at `scale` pixels per point: vector charts then go through the raster recognizer.
 */
export function rasterizeVectors(
  width: number,
  height: number,
  scale: number,
  segments: readonly { x1: number; y1: number; x2: number; y2: number; width: number }[],
  fills: readonly (readonly (readonly [number, number])[])[],
): GrayImage {
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const S = 2;
  const W = outW * S;
  const H = outH * S;
  const cov = new Float32Array(W * H);
  const k = scale * S;
  for (const pg of fills)
    polygon(
      cov,
      W,
      H,
      pg.map(([x, y]) => [x * k, y * k] as const),
    );
  for (const sg of segments) {
    capsule(
      cov,
      W,
      H,
      sg.x1 * k,
      sg.y1 * k,
      sg.x2 * k,
      sg.y2 * k,
      Math.max(0.5 * S, (sg.width * k) / 2),
    );
  }
  const out = createGray(outW, outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let c = 0;
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) c += cov[(y * S + j) * W + x * S + i] ?? 0;
      out.data[y * outW + x] = Math.round(255 - (c / (S * S)) * 255);
    }
  }
  return out;
}
