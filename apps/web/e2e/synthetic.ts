/**
 * Synthetic import fixtures, generated in memory for each run (self-made charts and wording, R-5):
 * a two-page PDF (legend + charts + a short description) and a PNG "screenshot" of a chart.
 */
import { createRegistry, type Chart } from '@kt/core';
import { writePdf, type PdfOp } from '../../../packages/importer/src/__tests__/pdf';
import { encodePng } from '../../../packages/importer/src/__tests__/png';
import {
  degrade,
  drawChart,
  randomChart,
  rng,
} from '../../../packages/importer/src/__tests__/synth';
import { renderCells } from '../../../packages/importer/src/raster/draw';

const reg = createRegistry();

const LEGEND: [string, string][] = [
  ['std:k', '= oczko prawe na prawej stronie, lewe na lewej'],
  ['std:p', '= oczko lewe na prawej stronie, prawe na lewej'],
  [
    'cable:2-2-lc',
    '= zdjac 2 oczka na drut pomocniczy z przodu, przerobic 2 oczka prawe, 2 oczka z drutu przerobic na prawo',
  ],
];

export interface SyntheticPdf {
  readonly buffer: Buffer;
  readonly charts: { readonly name: string; readonly chart: Chart }[];
}

export function syntheticPdf(): SyntheticPdf {
  const r = rng(2026);
  // Fillers only knit/purl (partial repeats must not cut cables); the panel has a cable.
  const b1 = randomChart(r, reg, ['std:k', 'std:p'], 4, 4, 'b1');
  const b2 = randomChart(r, reg, ['std:k', 'std:p', 'cable:2-2-lc'], 8, 6, 'b2');
  const legendOps: PdfOp[] = LEGEND.flatMap(([id, text], i) => {
    const def = reg.require(id);
    const img = renderCells({
      cols: def.width,
      rows: 1,
      cell: 10,
      stroke: 2,
      symbols: [{ row: 1, col: 1, width: def.width, glyph: def.glyph }],
    });
    const y = 80 + i * 22;
    const w = def.width * 9;
    return [
      { kind: 'image', x: 70 - w, y, w, h: 9, img } as const,
      { kind: 'text', x: 72, y: y + 8, size: 9, text } as const,
    ];
  });
  const c1 = drawChart(b1, reg, { cell: 12, stroke: 2.2, margin: 0 });
  const c2 = drawChart(b2, reg, { cell: 12, stroke: 2.2, margin: 0 });
  const chartOps: PdfOp[] = [
    { kind: 'text', x: 60, y: 70, size: 10, text: 'B.1' },
    { kind: 'image', x: 60, y: 80, w: c1.width * 0.75, h: c1.height * 0.75, img: c1 },
    { kind: 'text', x: 300, y: 70, size: 10, text: 'B.2' },
    { kind: 'image', x: 300, y: 80, w: c2.width * 0.75, h: c2.height * 0.75, img: c2 },
    { kind: 'text', x: 60, y: 300, size: 9, text: 'ROZMIARY: S - M' },
    { kind: 'text', x: 60, y: 312, size: 9, text: 'Razem = 18-22 oczek.' },
    {
      kind: 'text',
      x: 60,
      y: 324,
      size: 9,
      text: 'Przerabiac: B.1 ponad 4-6 oczkami, B.2, B.1 ponad 6-8 oczkami.',
    },
  ];
  const pdf = writePdf([
    { width: 595, height: 842, ops: legendOps },
    { width: 595, height: 842, ops: chartOps },
  ]);
  return {
    buffer: Buffer.from(pdf),
    charts: [
      { name: 'B.1', chart: b1 },
      { name: 'B.2', chart: b2 },
    ],
  };
}

/** A chart picture; `poor` makes a faint, noisy one where a few cells come out uncertain. */
export function syntheticPng(poor = false): { buffer: Buffer; chart: Chart } {
  const r = rng(7);
  const chart = randomChart(
    r,
    reg,
    ['std:k', 'std:p', 'cable:1-1-rpc', 'cable:1-1-lpc'],
    10,
    8,
    'png',
  );
  const img = drawChart(chart, reg, poor ? { cell: 14, stroke: 0.6 } : { cell: 18, stroke: 2.4 });
  return { buffer: Buffer.from(encodePng(poor ? degrade(img, r, 55, 60) : img)), chart };
}
