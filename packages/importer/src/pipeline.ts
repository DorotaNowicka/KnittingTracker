import { createRegistry, type SymbolRegistry } from '@kt/core';
import { parseDescription, type ParsedDescription } from './describe/parse';
import { findLegend, type LegendItem } from './legend/pair';
import { analyzePdf, documentText, type AnalyzedPage, type PdfJsLike } from './pdf/analyze';
import {
  imageTemplate,
  libraryTemplates,
  recognizeGrid,
  type RecognizedChart,
  type Template,
} from './raster/classify';
import { rasterizeVectors } from './raster/draw';
import { crop, meanGray, toGray, type GrayImage } from './raster/gray';
import { detectGrids, type DetectedGrid } from './raster/grid';
import { straighten, type Point } from './raster/warp';

/**
 * The import pipeline (ADR-5): file → analysed document → legend → grids → recognised cells →
 * description. Runs in a worker; reports progress; never touches the network.
 */

export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxPdfPages: 30,
  maxImagePixels: 40_000_000,
} as const;

/** Symbols tried when the document has no legend: common chart symbols (no bind-off etc.). */
export const DEFAULT_SYMBOLS: readonly string[] = [
  'std:k',
  'std:p',
  'std:none',
  'std:yo',
  'std:k2tog',
  'std:ssk',
  'std:m1l',
  'std:m1r',
  'cable:1-1-rc',
  'cable:1-1-lc',
  'cable:1-1-rpc',
  'cable:1-1-lpc',
  'cable:2-1-rc',
  'cable:2-1-lc',
  'cable:2-1-rpc',
  'cable:2-1-lpc',
  'cable:2-2-rc',
  'cable:2-2-lc',
  'cable:2-2-rpc',
  'cable:2-2-lpc',
];

export interface SourceImage {
  /** Page index (PDF) or 0 (image file). */
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  /** Where the pixels sit on the page: page point = origin + pixel × scale. */
  readonly placement?: { readonly x: number; readonly y: number; readonly scale: number };
  /** Drawn from vector content of the page (not an embedded image). */
  readonly vector?: boolean;
}

export interface FoundChart {
  /** Index into `ImportResult.sources`. */
  readonly source: number;
  /** Title found in the text right above the chart (e.g. "A.2"), if any. */
  readonly name?: string;
  readonly grid: DetectedGrid;
  readonly recognized: RecognizedChart;
  /** Area to show next to the grid (source pixels): the grid plus room for its title. */
  readonly view: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

export interface ImportResult {
  readonly kind: 'pdf' | 'image';
  readonly sources: readonly SourceImage[];
  readonly charts: readonly FoundChart[];
  readonly legend: readonly LegendItem[];
  /** Symbols the cells were matched against. */
  readonly symbols: readonly string[];
  readonly text: string;
  readonly description: ParsedDescription;
  readonly notes: readonly string[];
}

export type ImportProgress =
  | { readonly stage: 'reading'; readonly page?: number; readonly pages?: number }
  | { readonly stage: 'legend' }
  | { readonly stage: 'grids'; readonly done: number; readonly total: number }
  | { readonly stage: 'description' };

export interface ImportOptions {
  /** Restrict recognition to these symbols (the user's choice in the verification screen). */
  readonly symbols?: readonly string[];
  /** Photos: local thresholding. */
  readonly threshold?: 'global' | 'local';
  readonly registry?: SymbolRegistry;
  readonly signal?: AbortSignal;
  readonly onProgress?: (p: ImportProgress) => void;
}

/** Recognition templates: legend icons first (same drawing style), then built-in glyphs. */
export function buildTemplates(
  registry: SymbolRegistry,
  symbols: readonly string[],
  legend: readonly LegendItem[],
): Template[] {
  const out: Template[] = [];
  for (const item of legend) {
    if (item.symbolId && symbols.includes(item.symbolId))
      out.push(imageTemplate(item.symbolId, item.cells, item.gray));
  }
  for (const id of symbols) {
    const def = registry.get(id);
    if (def) out.push(...libraryTemplates(def));
  }
  return out;
}

function recognizeSources(
  sources: readonly { gray: GrayImage; index: number }[],
  registry: SymbolRegistry,
  symbols: readonly string[],
  legend: readonly LegendItem[],
  options: ImportOptions,
): FoundChart[] {
  const templates = buildTemplates(registry, symbols, legend);
  const charts: FoundChart[] = [];
  sources.forEach(({ gray, index }, n) => {
    if (options.signal?.aborted) throw new Error('aborted');
    options.onProgress?.({ stage: 'grids', done: n, total: sources.length });
    const threshold = options.threshold ?? (meanGray(gray) < 200 ? 'local' : 'global');
    for (const grid of detectGrids(gray, { threshold })) {
      // A chart has at least 2 columns, 2 rows and a regular lattice.
      if (grid.cols < 2 || grid.rows < 2 || grid.cols * grid.rows < 6 || grid.regularity < 0.6)
        continue;
      if (!mostlyPaper(gray, grid)) continue;
      const pad = grid.pitch * 0.6;
      const title = grid.pitch * 3.2;
      const x = Math.max(0, grid.box.x - pad);
      const y = Math.max(0, grid.box.y - title);
      charts.push({
        source: index,
        grid,
        recognized: recognizeGrid(gray, grid, templates),
        view: {
          x,
          y,
          w: Math.min(gray.width, grid.box.x + grid.box.w + pad) - x,
          h: Math.min(gray.height, grid.box.y + grid.box.h + pad) - y,
        },
      });
    }
  });
  return charts;
}

/** Chart cells are mostly paper; a photo that happens to contain a lattice is not. */
function mostlyPaper(gray: GrayImage, grid: DetectedGrid): boolean {
  let light = 0;
  let n = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const x0 = (grid.xs[c] ?? 0) + grid.pitch * 0.25;
      const y0 = (grid.ys[r] ?? 0) + grid.pitch * 0.25;
      for (let y = Math.round(y0); y < y0 + grid.pitch * 0.5; y++) {
        for (let x = Math.round(x0); x < x0 + grid.pitch * 0.5; x++) {
          n += 1;
          if ((gray.data[y * gray.width + x] ?? 0) > 170) light += 1;
        }
      }
    }
  }
  return n > 0 && light / n > 0.55;
}

const AXIS = 0.02;

/** The area of a page with many axis-aligned rules, rasterised at a few pixels per point. */
function vectorRegion(
  page: AnalyzedPage,
): { gray: GrayImage; placement: { x: number; y: number; scale: number } } | null {
  const rules = page.segments.filter(
    (s) =>
      Math.abs(s.y1 - s.y2) <= AXIS * Math.abs(s.x1 - s.x2) ||
      Math.abs(s.x1 - s.x2) <= AXIS * Math.abs(s.y1 - s.y2),
  );
  if (rules.length < 12) return null;
  const xs = rules.flatMap((s) => [s.x1, s.x2]);
  const ys = rules.flatMap((s) => [s.y1, s.y2]);
  const x0 = Math.max(0, Math.min(...xs) - 12);
  const y0 = Math.max(0, Math.min(...ys) - 12);
  const x1 = Math.min(page.width, Math.max(...xs) + 12);
  const y1 = Math.min(page.height, Math.max(...ys) + 12);
  const scale = Math.min(4, Math.sqrt(12_000_000 / Math.max(1, (x1 - x0) * (y1 - y0))));
  const shift = <T extends { x1: number; y1: number; x2: number; y2: number; width: number }>(
    s: T,
  ) => ({
    x1: s.x1 - x0,
    y1: s.y1 - y0,
    x2: s.x2 - x0,
    y2: s.y2 - y0,
    width: s.width,
  });
  const gray = rasterizeVectors(
    x1 - x0,
    y1 - y0,
    scale,
    page.segments.map(shift),
    page.fills.map((pg) => pg.map(([x, y]) => [x - x0, y - y0] as const)),
  );
  return { gray, placement: { x: x0, y: y0, scale: 1 / scale } };
}

function grayToRgba(g: GrayImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i] ?? 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

const NAME = /^[A-Z]{1,2}\.\d{1,2}[a-z]?$/;

/** The chart's title from the text layer: the nearest line just above the grid. */
function titleAbove(page: AnalyzedPage, src: SourceImage, grid: DetectedGrid): string | undefined {
  if (!src.placement) return undefined;
  const { x, y, scale } = src.placement;
  const left = x + grid.box.x * scale;
  const right = x + (grid.box.x + grid.box.w) * scale;
  const top = y + grid.box.y * scale;
  const pitch = grid.pitch * scale;
  const near = page.texts
    .filter(
      (t) =>
        t.str.trim() &&
        t.y <= top + pitch * 0.3 &&
        t.y >= top - pitch * 4.5 &&
        t.x + t.w >= left - pitch * 2 &&
        t.x <= right,
    )
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const named = near.find((t) => NAME.test(t.str.trim()));
  const text = (named ?? near[0])?.str.trim();
  return text ? text.slice(0, 40) : undefined;
}

/** Import a PDF file. */
export async function importPdf(
  pdfjs: PdfJsLike,
  bytes: Uint8Array,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const registry = options.registry ?? createRegistry();
  options.onProgress?.({ stage: 'reading' });
  const doc = await analyzePdf(pdfjs, bytes, {
    maxPages: UPLOAD_LIMITS.maxPdfPages,
    ...(options.signal ? { signal: options.signal } : {}),
    onPage: (page, pages) => options.onProgress?.({ stage: 'reading', page, pages }),
  });
  options.onProgress?.({ stage: 'legend' });
  const legend = doc.pages.flatMap((p) => findLegend(p, registry));
  // Only legend entries that are clearly a stitch symbol narrow the search.
  const fromLegend = [
    ...new Set(legend.flatMap((l) => (l.symbolId && l.confidence >= 0.6 ? [l.symbolId] : []))),
  ];
  const symbols = options.symbols ?? (fromLegend.length >= 2 ? fromLegend : DEFAULT_SYMBOLS);

  // Candidate chart images: big enough for a grid of a few cells.
  const sources: SourceImage[] = [];
  const grays: { gray: GrayImage; index: number }[] = [];
  for (const page of doc.pages) {
    for (const im of page.images) {
      if (im.gray.width < 24 || im.gray.height < 24) continue;
      if (im.gray.width * im.gray.height > UPLOAD_LIMITS.maxImagePixels) continue;
      grays.push({ gray: im.gray, index: sources.length });
      sources.push({
        page: page.index,
        width: im.gray.width,
        height: im.gray.height,
        rgba: im.rgba,
        placement: { x: im.x, y: im.y, scale: im.w / im.gray.width },
      });
    }
    // Vector charts: many horizontal and vertical rules drawn as paths are rendered to pixels.
    const vector = vectorRegion(page);
    if (vector) {
      grays.push({ gray: vector.gray, index: sources.length });
      sources.push({
        page: page.index,
        width: vector.gray.width,
        height: vector.gray.height,
        rgba: grayToRgba(vector.gray),
        placement: vector.placement,
        vector: true,
      });
    }
  }
  const charts = recognizeSources(grays, registry, symbols, legend, options);
  options.onProgress?.({ stage: 'description' });
  const text = documentText(doc);
  const notes: string[] = [];
  const named = charts.map((c) => {
    const src = sources[c.source];
    const page = src ? doc.pages[src.page] : undefined;
    const name = src && page ? titleAbove(page, src, c.grid) : undefined;
    return name ? { ...c, name } : c;
  });
  // Only images that hold a chart are kept for display.
  const used = [...new Set(charts.map((c) => c.source))];
  const remap = new Map(used.map((old, i) => [old, i]));
  return {
    kind: 'pdf',
    sources: used.map((i) => sources[i]).filter((s): s is SourceImage => !!s),
    charts: named.map((c) => ({ ...c, source: remap.get(c.source) ?? 0 })),
    legend,
    symbols,
    text,
    description: parseDescription(text),
    notes,
  };
}

/**
 * Import a decoded image (photo, screenshot, scan). With `corners` (a photo), the quadrilateral is
 * straightened first and read with local thresholding.
 */
export function importImage(
  image: { width: number; height: number; rgba: Uint8ClampedArray },
  options: ImportOptions & { readonly corners?: readonly Point[] } = {},
): ImportResult {
  const registry = options.registry ?? createRegistry();
  if (image.width * image.height > UPLOAD_LIMITS.maxImagePixels) throw new Error('too-many-pixels');
  const symbols = options.symbols ?? DEFAULT_SYMBOLS;
  let gray = toGray(image.rgba, image.width, image.height, 4);
  let rgba = image.rgba;
  if (options.corners?.length === 4) {
    gray = straighten(gray, options.corners);
    rgba = grayToRgba(gray);
  }
  const charts = recognizeSources([{ gray, index: 0 }], registry, symbols, [], {
    ...options,
    ...(options.corners ? { threshold: options.threshold ?? 'local' } : {}),
  });
  return {
    kind: 'image',
    sources: [{ page: 0, width: gray.width, height: gray.height, rgba }],
    charts,
    legend: [],
    symbols,
    text: '',
    description: parseDescription(''),
    notes: [],
  };
}

/** Only the text of a PDF (a pattern description in a second file) and what the parser found. */
export async function extractPdfText(
  pdfjs: PdfJsLike,
  bytes: Uint8Array,
): Promise<{ text: string; description: ParsedDescription }> {
  const doc = await analyzePdf(pdfjs, bytes, { maxPages: UPLOAD_LIMITS.maxPdfPages });
  const text = documentText(doc);
  return { text, description: parseDescription(text) };
}

/** Re-run recognition with another symbol set (after the user fixed the legend). */
export function rerecognize(
  result: ImportResult,
  symbols: readonly string[],
  legend: readonly LegendItem[],
  registry: SymbolRegistry = createRegistry(),
): ImportResult {
  const templates = buildTemplates(registry, symbols, legend);
  const grays = result.sources.map((s) => toGray(s.rgba, s.width, s.height, 4));
  return {
    ...result,
    symbols,
    legend,
    charts: result.charts.map((c) => {
      const gray = grays[c.source];
      return gray ? { ...c, recognized: recognizeGrid(gray, c.grid, templates) } : c;
    }),
  };
}

/** Cut the area of a source image (RGBA) for display. */
export function cropRgba(
  src: SourceImage,
  x: number,
  y: number,
  w: number,
  h: number,
): { width: number; height: number; rgba: Uint8ClampedArray } {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(src.width, Math.ceil(x + w));
  const y1 = Math.min(src.height, Math.ceil(y + h));
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let yy = 0; yy < height; yy++) {
    rgba.set(
      src.rgba.subarray(((y0 + yy) * src.width + x0) * 4, ((y0 + yy) * src.width + x1) * 4),
      yy * width * 4,
    );
  }
  return { width, height, rgba };
}

export { crop };
