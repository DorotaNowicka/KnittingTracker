import type { SymbolDef } from '@kt/core';
import { renderCells } from './draw';
import { resample, type GrayImage } from './gray';
import type { DetectedGrid } from './grid';

/**
 * Symbol recognition inside a detected grid (ADR-5, raster recognizer step 2).
 *
 * Every candidate span (start column × symbol width) is cut out, normalised to a fixed size and
 * compared with templates by normalised cross-correlation. Each row is then segmented by dynamic
 * programming: the non-overlapping sequence of symbols with the best total score. Confidence is the
 * margin between the chosen symbol and the best alternative for the same cells.
 */

/** Template size: pixels per cell side. */
export const TEMPLATE_CELL = 20;

export interface Template {
  readonly symbolId: string;
  readonly width: number;
  /** Normalised pixels (zero mean, unit norm), width·S × S. */
  readonly vec: Float32Array;
  readonly source: 'legend' | 'library';
}

export interface Scored<T> {
  readonly value: T;
  readonly score: number;
}

export interface RecognizedCell {
  readonly symbolId: string;
  /** 0 for the leftmost cell of a symbol. */
  readonly part: number;
  readonly width: number;
  /** 0 (a guess) … 1 (clear). Same for every cell of one symbol. */
  readonly confidence: number;
  /** Best symbols for this span, best first. */
  readonly candidates: readonly Scored<string>[];
}

export interface RecognizedChart {
  readonly cols: number;
  readonly rows: number;
  /** cells[row - 1][col - 1], row 1 = bottom (chart convention). */
  readonly cells: readonly (readonly RecognizedCell[])[];
}

function blur3(px: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += px[yy * w + xx] ?? 0;
          n += 1;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/** Pixels this close to a cell boundary are ignored: rules differ between sources, symbols don't. */
const BAND = 3;

const masks = new Map<number, Uint8Array>();
/** 1 where a pixel of a `w`-cell patch is inside a cell (away from the rules). */
function interiorMask(w: number): Uint8Array {
  let m = masks.get(w);
  if (m) return m;
  const S = TEMPLATE_CELL;
  m = new Uint8Array(w * S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < w * S; x++) {
      const dx = Math.min(x % S, S - 1 - (x % S));
      const dy = Math.min(y, S - 1 - y);
      // Inside a wide symbol, strokes cross the inner boundaries: keep a narrower band there.
      const inner = x >= BAND && x < w * S - BAND;
      const nearV = inner ? dx < 1 : dx < BAND;
      m[y * w * S + x] = nearV || dy < BAND ? 0 : 1;
    }
  }
  masks.set(w, m);
  return m;
}

/** Ink levels of a source: grey of the paper and of full ink. */
export interface InkLevels {
  readonly paper: number;
  readonly ink: number;
}

/** Paper and ink grey levels of an image region (robust percentiles). */
export function inkLevels(img: GrayImage, x = 0, y = 0, w = img.width, h = img.height): InkLevels {
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(img.height, Math.ceil(y + h)); yy++) {
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(img.width, Math.ceil(x + w)); xx++) {
      const v = img.data[yy * img.width + xx] ?? 255;
      hist[v] = (hist[v] ?? 0) + 1;
      n += 1;
    }
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v] ?? 0;
      if (acc >= q * n) return v;
    }
    return 255;
  };
  const paper = pct(0.9);
  const ink = Math.min(pct(0.02), paper - 60);
  return { paper, ink: Math.max(0, ink) };
}

/** Ink amount (0 paper … 1 full ink) of a normalised patch, blurred, with the rules masked out. */
export function normalize(
  img: GrayImage,
  levels: InkLevels = { paper: 255, ink: 0 },
): Float32Array {
  const range = Math.max(1, levels.paper - levels.ink);
  const ink = new Float32Array(img.width * img.height);
  for (let i = 0; i < ink.length; i++) {
    // Not clipped yet: noise above and below the paper level cancels out in the blur.
    ink[i] = Math.min(1, (levels.paper - (img.data[i] ?? 255)) / range);
  }
  const b = blur3(ink, img.width, img.height);
  const mask = interiorMask(Math.max(1, Math.round(img.width / TEMPLATE_CELL)));
  for (let i = 0; i < b.length; i++) b[i] = mask[i] ? Math.max(0, b[i] ?? 0) : 0;
  return b;
}

/** Below this much ink (sum of squares) a patch counts as empty; it also softens tiny specks. */
const EPS = 3;

/**
 * Similarity of two ink vectors: (2·a·b + ε) / (|a|² + |b|² + ε). 1 = identical, including two
 * empty cells; ≈0 when one is empty and the other is not.
 */
export function similarity(a: Float32Array, b: Float32Array): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return (2 * ab + EPS) / (aa + bb + EPS);
}

/** Template of a library symbol, drawn with cell rules like a printed chart. */
export function libraryTemplate(def: SymbolDef, stroke = 0.2): Template {
  const S = TEMPLATE_CELL;
  const img = renderCells({
    cols: def.width,
    rows: 1,
    cell: S,
    stroke: S * stroke,
    rule: 1.2,
    ruleGray: 70,
    symbols: [{ row: 1, col: 1, width: def.width, glyph: def.glyph, shaded: !def.worked }],
  });
  return { symbolId: def.id, width: def.width, vec: normalize(img), source: 'library' };
}

/** Stroke widths (fraction of a cell) of the library templates: printed charts vary a lot. */
export const LIBRARY_STROKES = [0.09, 0.15, 0.23] as const;

/** Library templates of a symbol in thin, medium and bold drawing. */
export function libraryTemplates(def: SymbolDef): Template[] {
  return LIBRARY_STROKES.map((s) => libraryTemplate(def, s));
}

/** Template from an image of the symbol (e.g. a legend icon), `width` cells wide. */
export function imageTemplate(symbolId: string, width: number, icon: GrayImage): Template {
  const S = TEMPLATE_CELL;
  const img = resample(icon, 0, 0, icon.width, icon.height, width * S, S);
  return { symbolId, width, vec: normalize(img, inkLevels(icon)), source: 'legend' };
}

/** Normalised patch of the cells (row from top, col from left, both 0-based) spanning `w` cells. */
function patch(
  img: GrayImage,
  grid: DetectedGrid,
  levels: InkLevels,
  rowTop: number,
  col: number,
  w: number,
): Float32Array {
  const S = TEMPLATE_CELL;
  const x0 = grid.xs[col] ?? 0;
  const x1 = grid.xs[col + w] ?? x0 + w * grid.pitch;
  const y0 = grid.ys[rowTop] ?? 0;
  const y1 = grid.ys[rowTop + 1] ?? y0 + grid.pitch;
  return normalize(resample(img, x0, y0, x1 - x0, y1 - y0, w * S, S), levels);
}

/**
 * Compare a patch with two templates only where the templates clearly differ. Returns the closer
 * one, or null when the difference region is empty or the evidence is balanced.
 */
export function discriminate(v: Float32Array, a: Float32Array, b: Float32Array): 'a' | 'b' | null {
  let da = 0;
  let db = 0;
  let n = 0;
  for (let i = 0; i < v.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (Math.abs(ai - bi) < 0.15) continue;
    const x = v[i] ?? 0;
    da += (x - ai) ** 2;
    db += (x - bi) ** 2;
    n += 1;
  }
  if (n < 3 || Math.abs(da - db) < 0.05 * n * 0.1) return null;
  return da <= db ? 'a' : 'b';
}

/** Median grey of a region: the paper level of a cell that is mostly paper, even in a noisy photo. */
function median(img: GrayImage, x: number, y: number, w: number, h: number): number {
  const v: number[] = [];
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(img.height, Math.ceil(y + h)); yy++)
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(img.width, Math.ceil(x + w)); xx++)
      v.push(img.data[yy * img.width + xx] ?? 255);
  v.sort((a, b) => a - b);
  return v[v.length >> 1] ?? 255;
}

/**
 * Paper level per cell: the median of the cell, then the maximum over the 3×3
 * neighbourhood, so a shaded "no stitch" cell still gets the paper level of its neighbours while a
 * dim corner of a photo gets its own.
 */
function localPaper(img: GrayImage, grid: DetectedGrid, levels: InkLevels): number[][] {
  const own: number[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < grid.cols; c++) {
      const x0 = grid.xs[c] ?? 0;
      const y0 = grid.ys[r] ?? 0;
      const x1 = grid.xs[c + 1] ?? x0 + grid.pitch;
      const y1 = grid.ys[r + 1] ?? y0 + grid.pitch;
      const pad = grid.pitch * 0.18;
      row.push(
        Math.min(
          levels.paper,
          median(img, x0 + pad, y0 + pad, x1 - x0 - 2 * pad, y1 - y0 - 2 * pad),
        ),
      );
    }
    own.push(row);
  }
  return own.map((row, r) =>
    row.map((_, c) => {
      let best = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) best = Math.max(best, own[r + dr]?.[c + dc] ?? 0);
      return best;
    }),
  );
}

interface Fill {
  /** Lower quartile, median and upper quartile of the ink inside the cell rules. */
  readonly q1: number;
  readonly q2: number;
  readonly q3: number;
}

/** Ink quartiles inside the cell rules: a filled (shaded) cell is dark and even throughout. */
function fillOf(vec: Float32Array, cells: number): Fill {
  const mask = interiorMask(cells);
  const v: number[] = [];
  for (let i = 0; i < vec.length; i++) if (mask[i]) v.push(vec[i] ?? 0);
  v.sort((a, b) => a - b);
  const q = (f: number) => v[Math.floor(v.length * f)] ?? 0;
  return { q1: q(0.25), q2: q(0.5), q3: q(0.75) };
}

const fills = new WeakMap<Template, Fill>();
const templateFill = (t: Template) => {
  let f = fills.get(t);
  if (f === undefined) fills.set(t, (f = fillOf(t.vec, t.width)));
  return f;
};

/**
 * A filled symbol ("no stitch") must look filled: a thin ring blurred by noise (a yarn-over in a
 * poor photo) can score close to a grey fill, but its ink is uneven (bright inside the ring).
 */
const FILL_PENALTY = 0.3;
const looksFilled = (f: Fill, template: Fill) => f.q2 >= template.q2 / 3 && f.q1 >= f.q3 * 0.5;

/**
 * Cells below this confidence must be checked by the user. Calibrated on noisy synthetic photos,
 * where every misread cell stayed below it; clean PDFs have no cells under 0.8.
 */
export const UNCERTAIN_BELOW = 0.7;

/** Map a score margin to a 0…1 confidence (calibrated on synthetic charts). */
export const confidenceOf = (margin: number) => Math.max(0, Math.min(1, margin / 0.12));

/**
 * Recognize every cell of a grid. `templates` may hold several templates per symbol (legend icon
 * and library glyph); the best one counts.
 */
export function recognizeGrid(
  img: GrayImage,
  grid: DetectedGrid,
  templates: readonly Template[],
): RecognizedChart {
  const widths = [...new Set(templates.map((t) => t.width))].sort((a, b) => a - b);
  const levels = inkLevels(img, grid.box.x, grid.box.y, grid.box.w, grid.box.h);
  const paper = localPaper(img, grid, levels);
  const rowsTopDown: RecognizedCell[][] = [];
  for (let rt = 0; rt < grid.rows; rt++) {
    // scores[c][w] = best-first symbol scores for the span starting at column c, w cells wide.
    const spans = new Map<string, Scored<string>[]>();
    // Per span: the patch and the best template of each symbol (for the close-call check below).
    const detail = new Map<string, { v: Float32Array; tpl: Map<string, Template> }>();
    for (let c = 0; c < grid.cols; c++) {
      for (const w of widths) {
        if (c + w > grid.cols) continue;
        // Paper level of these cells (uneven light in photos): the brightest of their neighbourhood.
        let local = 0;
        for (let k = 0; k < w; k++) local += paper[rt]?.[c + k] ?? levels.paper;
        local /= w;
        const v = patch(
          img,
          grid,
          { paper: local, ink: Math.min(levels.ink, local - 60) },
          rt,
          c,
          w,
        );
        const best = new Map<string, number>();
        const tpl = new Map<string, Template>();
        const fill = fillOf(v, w);
        for (const t of templates) {
          if (t.width !== w) continue;
          const tf = templateFill(t);
          const filled = tf.q2 > 0.15 && tf.q1 > tf.q3 * 0.7;
          const s = similarity(v, t.vec) - (filled && !looksFilled(fill, tf) ? FILL_PENALTY : 0);
          if (s > (best.get(t.symbolId) ?? -Infinity)) {
            best.set(t.symbolId, s);
            tpl.set(t.symbolId, t);
          }
        }
        detail.set(`${c}:${w}`, { v, tpl });
        spans.set(
          `${c}:${w}`,
          [...best.entries()]
            .map(([value, score]) => ({ value, score }))
            .sort((a, b) => b.score - a.score),
        );
      }
    }
    // Dynamic programming over the row: dp[c] = best total for the first c cells.
    const dp = new Array<number>(grid.cols + 1).fill(-Infinity);
    const back = new Array<{ from: number; w: number } | null>(grid.cols + 1).fill(null);
    dp[0] = 0;
    for (let c = 0; c < grid.cols; c++) {
      if (dp[c] === -Infinity) continue;
      for (const w of widths) {
        const top = spans.get(`${c}:${w}`)?.[0];
        if (!top) continue;
        const total = (dp[c] ?? 0) + top.score * w;
        if (total > (dp[c + w] ?? -Infinity)) {
          dp[c + w] = total;
          back[c + w] = { from: c, w };
        }
      }
    }
    const segments: { c: number; w: number }[] = [];
    for (let c = grid.cols; c > 0;) {
      const b = back[c];
      if (!b) break;
      segments.unshift({ c: b.from, w: b.w });
      c = b.from;
    }
    const row: RecognizedCell[] = [];
    for (const seg of segments) {
      let cand = spans.get(`${seg.c}:${seg.w}`) ?? [];
      // Close call between two symbols of the same width: decide on the pixels where their
      // templates differ (e.g. a small purl mark next to a cable line).
      const d = detail.get(`${seg.c}:${seg.w}`);
      const [a, b] = cand;
      if (d && a && b && a.score - b.score < 0.12) {
        const ta = d.tpl.get(a.value);
        const tb = d.tpl.get(b.value);
        if (ta && tb) {
          const pick = discriminate(d.v, ta.vec, tb.vec);
          if (pick === 'b')
            cand = [{ ...b, score: a.score + 0.001 }, { ...a, score: b.score }, ...cand.slice(2)];
          if (pick !== null)
            cand = [
              cand[0] ?? a,
              { ...(cand[1] ?? b), score: (cand[1] ?? b).score - 0.06 },
              ...cand.slice(2),
            ];
        }
      }
      const first = cand[0];
      // Alternatives: another symbol of the same width, or the best split into narrower symbols.
      let alt = cand[1]?.score ?? -1;
      if (seg.w > 1) {
        let split = 0;
        for (let k = 0; k < seg.w; k++) split += spans.get(`${seg.c + k}:1`)?.[0]?.score ?? -1;
        alt = Math.max(alt, split / seg.w);
      }
      const confidence = first ? confidenceOf(first.score - alt) : 0;
      for (let k = 0; k < seg.w; k++) {
        row.push({
          symbolId: first?.value ?? 'std:k',
          part: k,
          width: seg.w,
          confidence,
          candidates: cand.slice(0, 4),
        });
      }
    }
    rowsTopDown.push(row);
  }
  return { cols: grid.cols, rows: grid.rows, cells: rowsTopDown.reverse() };
}
