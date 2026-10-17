import { toGray, type GrayImage } from '../raster/gray';

/**
 * PDF analysis with pdf.js (ADR-5, step 2): for each page, the text items, the images (with their
 * pixels and where they are drawn) and the straight path segments, all in page coordinates
 * (points, origin top-left).
 *
 * The pdf.js module is passed in, so the same code runs in the browser worker (modern build) and
 * in Node tests (legacy build). Fonts are not loaded, nothing is evaluated, no scripting or XFA.
 */

export interface TextItem {
  readonly str: string;
  /** Left edge and baseline. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  /** Font size (≈ line height). */
  readonly h: number;
}

export interface PageImage {
  /** Bounding box on the page (points, top-left origin). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly gray: GrayImage;
  /** Pixels for display, RGBA. */
  readonly rgba: Uint8ClampedArray;
}

export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Stroke width in points. */
  readonly width: number;
}

export interface AnalyzedPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly texts: readonly TextItem[];
  readonly images: readonly PageImage[];
  /** Straight segments of stroked or thin filled paths (vector charts). */
  readonly segments: readonly Segment[];
  /** Filled shapes (vector symbols), as polygons. */
  readonly fills: readonly (readonly (readonly [number, number])[])[];
}

export interface AnalyzedDocument {
  readonly pages: readonly AnalyzedPage[];
}

/** The part of the pdf.js API used here (structural, so both builds fit). */
export interface PdfJsLike {
  getDocument(src: Record<string, unknown>): {
    promise: Promise<PdfDocLike>;
    destroy?(): Promise<void>;
  };
  OPS: Record<string, number>;
}
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy?(): Promise<void>;
}
interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  getTextContent(): Promise<{ items: unknown[] }>;
  objs: { get(id: string, cb: (o: unknown) => void): unknown };
  commonObjs: { get(id: string, cb: (o: unknown) => void): unknown };
  cleanup(): void;
}

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

interface RawImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}

/** pdf.js image kinds: 1 = 1 bit grey, 2 = RGB, 3 = RGBA. */
function toRgba(img: RawImage): Uint8ClampedArray | null {
  const { width: w, height: h, data, kind } = img;
  if (!data || !w || !h) return null;
  const out = new Uint8ClampedArray(w * h * 4);
  if (kind === 3) out.set(data.subarray(0, w * h * 4));
  else if (kind === 2) {
    for (let i = 0; i < w * h; i++) {
      out[i * 4] = data[i * 3] ?? 0;
      out[i * 4 + 1] = data[i * 3 + 1] ?? 0;
      out[i * 4 + 2] = data[i * 3 + 2] ?? 0;
      out[i * 4 + 3] = 255;
    }
  } else if (kind === 1) {
    const stride = Math.ceil(w / 8);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = ((data[y * stride + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * w + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = v;
        out[i + 3] = 255;
      }
    }
  } else return null;
  return out;
}

const getObj = (store: PdfPageLike['objs'], id: string) =>
  new Promise<unknown>((resolve) => {
    try {
      store.get(id, resolve);
    } catch {
      resolve(null);
    }
  });

export interface AnalyzeOptions {
  readonly maxPages: number;
  /** Images smaller than this (pixels) are kept only if they may be legend icons. */
  readonly signal?: AbortSignal;
  readonly onPage?: (index: number, total: number) => void;
}

export async function analyzePdf(
  pdfjs: PdfJsLike,
  data: Uint8Array,
  options: AnalyzeOptions,
): Promise<AnalyzedDocument> {
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  const OPS = pdfjs.OPS;
  const op = (name: string) => OPS[name] ?? -1;
  try {
    if (doc.numPages > options.maxPages) throw new Error(`too-many-pages:${doc.numPages}`);
    const pages: AnalyzedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (options.signal?.aborted) throw new Error('aborted');
      options.onPage?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const H = vp.height;
      const list = await page.getOperatorList();
      const images: PageImage[] = [];
      const segments: Segment[] = [];
      const fills: [number, number][][] = [];
      let ctm: M = [1, 0, 0, 1, 0, 0];
      let lineWidth = 1;
      const stack: M[] = [];
      const widths: number[] = [];
      const toPage = (x: number, y: number): [number, number] => {
        const [px, py] = apply(ctm, x, y);
        return [px, H - py];
      };
      for (let i = 0; i < list.fnArray.length; i++) {
        const fn = list.fnArray[i];
        const args = list.argsArray[i] ?? [];
        const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
        if (fn === op('save')) {
          stack.push(ctm);
          widths.push(lineWidth);
        } else if (fn === op('restore')) {
          ctm = stack.pop() ?? ctm;
          lineWidth = widths.pop() ?? lineWidth;
        } else if (fn === op('setLineWidth')) lineWidth = Number(args[0]) || 1;
        else if (fn === op('transform')) ctm = mul(ctm, args as unknown as M);
        else if (fn === op('paintFormXObjectBegin')) {
          stack.push(ctm);
          const m = args[0] as M | null;
          if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m);
        } else if (fn === op('paintFormXObjectEnd')) ctm = stack.pop() ?? ctm;
        else if (fn === op('paintImageXObject') || fn === op('paintInlineImageXObject')) {
          const raw = (
            fn === op('paintInlineImageXObject')
              ? args[0]
              : await getObj(
                  String(args[0]).startsWith('g_') ? page.commonObjs : page.objs,
                  String(args[0]),
                )
          ) as RawImage | null;
          const rgba = raw ? toRgba(raw) : null;
          if (!raw || !rgba) continue;
          const corners = [toPage(0, 0), toPage(1, 0), toPage(0, 1), toPage(1, 1)];
          const xs = corners.map((c) => c[0]);
          const ys = corners.map((c) => c[1]);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          images.push({
            x,
            y,
            w: Math.max(...xs) - x,
            h: Math.max(...ys) - y,
            gray: toGray(rgba, raw.width, raw.height, 4),
            rgba,
          });
        } else if (fn === op('constructPath')) {
          const after = args[0] as number;
          const path = (args[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined;
          if (!path) continue;
          const stroked =
            after === op('stroke') ||
            after === op('closeStroke') ||
            after === op('fillStroke') ||
            after === op('closeFillStroke');
          const filled =
            after === op('fill') ||
            after === op('eoFill') ||
            after === op('fillStroke') ||
            after === op('eoFillStroke') ||
            after === op('closeFillStroke');
          if (!stroked && !filled) continue;
          // Path data: 0 moveTo x y, 1 lineTo x y, 2 curveTo 6, 3 quadraticCurveTo 4, 4 closePath.
          let k = 0;
          let poly: [number, number][] = [];
          let start: [number, number] | null = null;
          let last: [number, number] | null = null;
          const polys: [number, number][][] = [];
          while (k < path.length) {
            const code = path[k] ?? 4;
            if (code === 0) {
              if (poly.length) polys.push(poly);
              last = start = toPage(path[k + 1] ?? 0, path[k + 2] ?? 0);
              poly = [last];
              k += 3;
            } else if (code === 1) {
              const p = toPage(path[k + 1] ?? 0, path[k + 2] ?? 0);
              if (last && stroked)
                segments.push({
                  x1: last[0],
                  y1: last[1],
                  x2: p[0],
                  y2: p[1],
                  width: lineWidth * scale,
                });
              poly.push(p);
              last = p;
              k += 3;
            } else if (code === 2) {
              const p = toPage(path[k + 5] ?? 0, path[k + 6] ?? 0);
              poly.push(p);
              last = p;
              k += 7;
            } else if (code === 3) {
              const p = toPage(path[k + 3] ?? 0, path[k + 4] ?? 0);
              poly.push(p);
              last = p;
              k += 5;
            } else {
              if (last && start && stroked) {
                segments.push({
                  x1: last[0],
                  y1: last[1],
                  x2: start[0],
                  y2: start[1],
                  width: lineWidth * scale,
                });
              }
              last = start;
              k += 1;
            }
          }
          if (poly.length) polys.push(poly);
          if (filled) {
            for (const pg of polys) {
              // Thin filled rectangles are rules drawn as fills (common in HTML-to-PDF output).
              const xs = pg.map((p) => p[0]);
              const ys = pg.map((p) => p[1]);
              const w = Math.max(...xs) - Math.min(...xs);
              const h = Math.max(...ys) - Math.min(...ys);
              if (pg.length >= 4 && pg.length <= 5 && (w < 1.5 || h < 1.5) && Math.max(w, h) > 3) {
                const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
                const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
                segments.push(
                  w < h
                    ? {
                        x1: cx,
                        y1: Math.min(...ys),
                        x2: cx,
                        y2: Math.max(...ys),
                        width: Math.max(0.3, w),
                      }
                    : {
                        x1: Math.min(...xs),
                        y1: cy,
                        x2: Math.max(...xs),
                        y2: cy,
                        width: Math.max(0.3, h),
                      },
                );
              } else fills.push(pg);
            }
          }
        }
      }
      const tc = await page.getTextContent();
      const texts: TextItem[] = [];
      for (const raw of tc.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
        if (!it.str || !it.transform) continue;
        const [a = 1, b = 0, , d = 1, e = 0, f = 0] = it.transform;
        texts.push({
          str: it.str,
          x: e,
          y: H - f,
          w: it.width ?? 0,
          h: Math.hypot(a, b) || Math.abs(d) || (it.height ?? 0),
        });
      }
      pages.push({ index: n - 1, width: vp.width, height: H, texts, images, segments, fills });
      page.cleanup();
    }
    return { pages };
  } finally {
    await (task.destroy ? task.destroy() : doc.destroy?.());
  }
}

/** All text of a document in reading order, one line per text line (for the description parser). */
export function documentText(doc: AnalyzedDocument): string {
  const lines: string[] = [];
  for (const page of doc.pages) {
    const items = [...page.texts].sort((a, b) =>
      Math.abs(a.y - b.y) > Math.max(2, a.h * 0.4) ? a.y - b.y : a.x - b.x,
    );
    let current: TextItem[] = [];
    const flush = () => {
      // Items are glued with a space only where there is a visible gap between them.
      let line = '';
      let end = -Infinity;
      for (const t of current) {
        if (line && t.x - end > t.h * 0.15 && !line.endsWith(' ') && !t.str.startsWith(' '))
          line += ' ';
        line += t.str;
        end = t.x + t.w;
      }
      if (line.trim()) lines.push(line.replace(/\s+/g, ' ').trim());
      current = [];
    };
    for (const t of items) {
      const prev = current[current.length - 1];
      if (prev && Math.abs(prev.y - t.y) > Math.max(2, prev.h * 0.4)) flush();
      current.push(t);
    }
    flush();
  }
  return lines.filter(Boolean).join('\n');
}
