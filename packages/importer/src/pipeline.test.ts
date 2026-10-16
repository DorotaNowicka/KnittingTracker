import { chartToSymbolRows, createRegistry, type Chart } from '@kt/core';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writePdf, type PdfOp } from './__tests__/pdf';
import { drawChart, randomChart, rng } from './__tests__/synth';
import type { PdfJsLike } from './pdf/analyze';
import {
  cropRgba,
  DEFAULT_SYMBOLS,
  importImage,
  importPdf,
  rerecognize,
  type FoundChart,
} from './pipeline';
import { renderCells } from './raster/draw';

const reg = createRegistry();
const pdfjs = async () => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;

function errors(found: FoundChart | undefined, chart: Chart): number {
  if (!found) return Infinity;
  const truth = chartToSymbolRows(chart);
  let n = 0;
  found.recognized.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if ((cell.part === 0 ? cell.symbolId : '.') !== truth[r]?.[c]) n += 1;
    }),
  );
  return n;
}

/** Legend icon of a symbol, 10 px per cell like a web page printed to PDF. */
const icon = (id: string) => {
  const def = reg.require(id);
  return renderCells({
    cols: def.width,
    rows: 1,
    cell: 10,
    stroke: 2,
    symbols: [{ row: 1, col: 1, width: def.width, glyph: def.glyph }],
  });
};

// Own legend wording (ASCII: the test PDF uses a standard font without Polish letters).
const LEGEND: [string, string][] = [
  ['std:k', '= oczko prawe na prawej stronie, lewe na lewej'],
  ['std:p', '= oczko lewe na prawej stronie, prawe na lewej'],
  [
    'cable:2-2-lc',
    '= zdjac 2 oczka na drut pomocniczy z przodu, przerobic 2 oczka prawe, 2 oczka z drutu przerobic na prawo',
  ],
  [
    'cable:1-1-rpc',
    '= zdjac 1 oczko na drut pomocniczy z tylu, przerobic 1 oczko prawe, oczko z drutu przerobic na lewo',
  ],
  [
    'cable:1-1-lpc',
    '= zdjac 1 oczko na drut pomocniczy z przodu, przerobic 1 oczko lewe, oczko z drutu przerobic na prawo',
  ],
];
const SYMBOLS = LEGEND.map(([id]) => id);

describe('PDF import (synthetic)', () => {
  const r = rng(42);
  const b1 = randomChart(r, reg, SYMBOLS, 16, 12, 'b1');
  const b2 = randomChart(r, reg, SYMBOLS, 6, 8, 'b2');

  it('reads the legend, finds both charts with their titles and recognises every cell', async () => {
    const legendOps: PdfOp[] = LEGEND.flatMap(([id, text], i) => {
      const img = icon(id);
      const y = 80 + i * 22;
      const w = (img.width / 10) * 9;
      return [
        { kind: 'image', x: 70 - w, y, w, h: 9, img } as const,
        { kind: 'text', x: 72, y: y + 8, size: 9, text } as const,
      ];
    });
    const c1 = drawChart(b1, reg, { cell: 11, stroke: 2.2, margin: 0 });
    const c2 = drawChart(b2, reg, { cell: 11, stroke: 2.2, margin: 0 });
    const chartsOps: PdfOp[] = [
      { kind: 'text', x: 60, y: 70, size: 10, text: 'B.1' },
      { kind: 'image', x: 60, y: 80, w: c1.width * 0.75, h: c1.height * 0.75, img: c1 },
      { kind: 'text', x: 300, y: 70, size: 10, text: 'B.2' },
      { kind: 'image', x: 300, y: 80, w: c2.width * 0.75, h: c2.height * 0.75, img: c2 },
      { kind: 'text', x: 60, y: 400, size: 9, text: 'ROZMIARY: S - M' },
      {
        kind: 'text',
        x: 60,
        y: 412,
        size: 9,
        text: 'Przerabiac: B.1 ponad 3-5 oczkami, B.2, B.1 ponad 4-6 oczkami.',
      },
    ];
    const pdf = writePdf([
      { width: 595, height: 842, ops: legendOps },
      { width: 595, height: 842, ops: chartsOps },
    ]);
    const progress: string[] = [];
    const result = await importPdf(await pdfjs(), pdf, {
      onProgress: (p) => progress.push(p.stage),
    });

    expect(result.legend.map((l) => [l.symbolId, l.cells])).toEqual(
      LEGEND.map(([id]) => [id, reg.require(id).width]),
    );
    expect(result.legend.every((l) => l.meaning !== null && l.confidence > 0.6)).toBe(true);
    expect([...result.symbols].sort()).toEqual([...SYMBOLS].sort());
    expect(result.charts.map((c) => [c.name, c.grid.cols, c.grid.rows])).toEqual([
      ['B.1', 16, 12],
      ['B.2', 6, 8],
    ]);
    expect(errors(result.charts[0], b1)).toBe(0);
    expect(errors(result.charts[1], b2)).toBe(0);
    expect(result.description.sizes?.value).toEqual(['S', 'M']);
    expect(result.description.sequence?.value.map((s) => s.chart)).toEqual(['B.1', 'B.2', 'B.1']);
    expect(progress).toEqual(expect.arrayContaining(['reading', 'legend', 'grids', 'description']));

    // The view crop holds the grid and its title area.
    const c = result.charts[0];
    const src = c ? result.sources[c.source] : undefined;
    if (!c || !src) throw new Error('missing');
    const view = cropRgba(src, c.view.x, c.view.y, c.view.w, c.view.h);
    expect(view.width).toBeGreaterThan(c.grid.box.w);
    expect(view.rgba.length).toBe(view.width * view.height * 4);

    // Re-run with a narrower symbol set: the user said only knit and purl appear.
    const again = rerecognize(result, ['std:k', 'std:p'], result.legend);
    expect(
      again.charts[0]?.recognized.cells
        .flat()
        .every((cell) => ['std:k', 'std:p'].includes(cell.symbolId)),
    ).toBe(true);
  }, 30_000);

  it('reads charts drawn as vector paths', async () => {
    const chart = randomChart(rng(5), reg, ['std:k', 'std:p'], 8, 6, 'v');
    const ops: PdfOp[] = [];
    const cell = 14;
    const x0 = 100;
    const y0 = 100;
    for (let c = 0; c <= chart.width; c++) {
      ops.push({
        kind: 'line',
        x1: x0 + c * cell,
        y1: y0,
        x2: x0 + c * cell,
        y2: y0 + chart.height * cell,
        width: 0.6,
      });
    }
    for (let rr = 0; rr <= chart.height; rr++) {
      ops.push({
        kind: 'line',
        x1: x0,
        y1: y0 + rr * cell,
        x2: x0 + chart.width * cell,
        y2: y0 + rr * cell,
        width: 0.6,
      });
    }
    const rows = chartToSymbolRows(chart);
    rows.forEach((row, ri) =>
      row.forEach((id, ci) => {
        if (id !== 'std:p') return;
        const y = y0 + (chart.height - ri - 0.5) * cell;
        ops.push({
          kind: 'line',
          x1: x0 + (ci + 0.28) * cell,
          y1: y,
          x2: x0 + (ci + 0.72) * cell,
          y2: y,
          width: 1.6,
        });
      }),
    );
    ops.push({ kind: 'text', x: x0, y: y0 - 8, size: 10, text: 'C.1' });
    const result = await importPdf(await pdfjs(), writePdf([{ width: 400, height: 400, ops }]));
    expect(result.charts).toHaveLength(1);
    expect(result.sources[0]?.vector).toBe(true);
    expect(result.charts[0]?.name).toBe('C.1');
    expect(errors(result.charts[0], chart)).toBe(0);
  }, 30_000);

  it('refuses PDFs with too many pages and reports progress per page', async () => {
    const many = writePdf(Array.from({ length: 31 }, () => ({ width: 100, height: 100, ops: [] })));
    await expect(importPdf(await pdfjs(), many)).rejects.toThrow(/too-many-pages/);
    const pages: number[] = [];
    const two = writePdf([
      { width: 100, height: 100, ops: [] },
      { width: 100, height: 100, ops: [] },
    ]);
    const res = await importPdf(await pdfjs(), two, {
      onProgress: (p) => p.stage === 'reading' && p.page !== undefined && pages.push(p.page),
    });
    expect(pages).toEqual([1, 2]);
    expect(res.charts).toEqual([]);
  }, 30_000);
});

describe('image import', () => {
  it('recognises a screenshot of a chart with the default symbols', () => {
    const chart = randomChart(rng(9), reg, DEFAULT_SYMBOLS, 12, 10);
    const g = drawChart(chart, reg, { cell: 15 });
    const rgba = new Uint8ClampedArray(g.width * g.height * 4);
    g.data.forEach((v, i) => rgba.set([v, v, v, 255], i * 4));
    const result = importImage({ width: g.width, height: g.height, rgba });
    expect(result.charts).toHaveLength(1);
    expect(errors(result.charts[0], chart)).toBe(0);
    expect(() =>
      importImage({ width: 8000, height: 8000, rgba: new Uint8ClampedArray(4) }),
    ).toThrow('too-many-pixels');
  });
});

// Local acceptance test (ADR-5): the real pattern stays out of the repository; skipped without it.
const DROPS = new URL('../../../inspirations/DROPS 246-2.pdf', import.meta.url);
const GOLDEN = new URL('../../../local/golden/ocean-ropes.ktpattern.json', import.meta.url);
const haveLocal = existsSync(DROPS) && existsSync(GOLDEN);

describe.skipIf(!haveLocal)('local acceptance: DROPS 246-2.pdf', () => {
  it('finds the 4 charts with exact dimensions and reports the cell difference to the golden copy', async () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { pattern: { charts: Chart[] } };
    const result = await importPdf(await pdfjs(), new Uint8Array(readFileSync(DROPS)));
    const dims = result.charts.map((c) => `${c.grid.cols}x${c.grid.rows}`).sort();
    expect(dims).toEqual(['14x22', '3x9', '44x20', '8x9']);
    const report: Record<string, number> = {};
    for (const c of result.charts) {
      const gold = golden.pattern.charts.find(
        (g) => g.width === c.grid.cols && g.height === c.grid.rows,
      );
      if (gold) report[gold.id] = errors(c, gold);
    }
    // Reported as numbers (target 0 for A.2–A.4).
    console.info('[acceptance] cell differences vs golden:', report);
    expect(report).toEqual({ 'A.1': 0, 'A.2': 0, 'A.3': 0, 'A.4': 0 });
    expect(result.legend.filter((l) => l.confidence >= 0.6)).toHaveLength(8);
  }, 60_000);
});

describe('photo import with corners', () => {
  it('straightens before reading', () => {
    const chart = randomChart(rng(11), reg, ['std:k', 'std:p'], 10, 8);
    const g = drawChart(chart, reg, { cell: 16, margin: 4 });
    const rgba = new Uint8ClampedArray(g.width * g.height * 4);
    g.data.forEach((v, i) => rgba.set([v, v, v, 255], i * 4));
    const result = importImage(
      { width: g.width, height: g.height, rgba },
      {
        symbols: ['std:k', 'std:p'],
        corners: [
          [0, 0],
          [g.width, 0],
          [g.width, g.height],
          [0, g.height],
        ],
      },
    );
    expect(result.sources[0]?.width).toBe(g.width);
    expect(errors(result.charts[0], chart)).toBe(0);
  });
});
