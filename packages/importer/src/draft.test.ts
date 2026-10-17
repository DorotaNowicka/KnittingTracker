import {
  chartToSymbolRows,
  patternSchema,
  resolveStage,
  validatePattern,
  type Chart,
  type Pattern,
} from '@kt/core';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDescription } from './describe/parse';
import { buildPattern, placeMarker } from './draft';
import type { PdfJsLike } from './pdf/analyze';
import { importPdf } from './pipeline';

const rows = (w: number, h: number, id = 'std:k') =>
  Array.from({ length: h }, () => Array<string>(w).fill(id));

describe('pattern draft from an import', () => {
  const text = `ROZMIARY:
S - M - L
Dodać oczka = 144-156-168 oczek.
Umieścić marker za 72-78-84 oczkami. Dalej: B.1 ponad 10-13-16 oczkami, B.2, B.3, B.2, B.1 ponad 20-26-32 oczkami, B.2, B.3, B.2, B.1 ponad 10-13-16 oczkami.`;
  const d = parseDescription(text);
  const input = {
    id: 'imp-1',
    title: 'Import testowy',
    sizes: d.sizes?.value ?? [],
    charts: [
      { name: 'B.1', rows: rows(1, 2) },
      { name: 'B.2', rows: rows(6, 4, 'std:p') },
      { name: 'B.3', rows: rows(40, 3) },
    ],
    legend: [{ symbolId: 'std:p', text: 'lewe' }],
    stageName: 'Korpus',
    sequence: d.sequence?.value ?? [],
    stitchCount: d.stitchCount?.value ?? [],
    marker: d.marker?.value ?? [],
    sectionNames: ['Przód', 'Tył'] as const,
  };

  it('builds a valid pattern with the layout, the stitch count and a side marker', () => {
    const p = buildPattern(input);
    expect(patternSchema.safeParse(p).success).toBe(true);
    expect(validatePattern(p).diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
    const sizes = p.sizes.map((_, i) => resolveStage(p, 'stage-1', i));
    expect(sizes.map((s) => s.stitchCount)).toEqual([144, 156, 168]);
    expect(sizes.map((s) => s.markers.map((m) => m.afterStitch))).toEqual([
      [0, 72],
      [0, 78],
      [0, 84],
    ]);
    expect(sizes[1]?.sections.map((s) => s.name)).toEqual(['Przód', 'Tył']);
    // The middle filler was split around the marker: 20-26-32 → 10-13-16 + 10-13-16.
    const filler = p.stages[0]?.layout.filter((s) => s.kind === 'chart' && s.chartId === 'b-1');
    expect(filler?.map((s) => s.kind === 'chart' && s.stitches)).toEqual([
      [10, 13, 16],
      [10, 13, 16],
      [10, 13, 16],
      [10, 13, 16],
    ]);
    expect(p.legend).toEqual([{ symbolId: 'std:p', text: 'lewe' }]);
  });

  it('skips unknown charts, keeps uniform values compact and works without a marker', () => {
    const p = buildPattern({
      ...input,
      sizes: ['jeden'],
      sequence: [{ chart: 'B.1', stitches: [8] }, { chart: 'X.9' }],
      stitchCount: [8],
      marker: [],
      sectionNames: undefined as unknown as readonly [string, string],
    });
    expect(p.stages[0]?.layout).toEqual([
      { kind: 'marker', id: 'start' },
      { kind: 'chart', placementId: 'b-1-1', chartId: 'b-1', stitches: 8 },
    ]);
    expect(p.stages[0]?.expectedStitches).toBe(8);
    const empty = buildPattern({
      ...input,
      title: '',
      sizes: [],
      sequence: [],
      stitchCount: [],
      marker: [],
    });
    expect(empty.title).toBe('Wzór');
    expect(empty.sizes).toEqual(['1']);
  });

  it('leaves the layout alone when the marker can’t be placed the same way in every size', () => {
    const chart: Chart = {
      id: 'a',
      name: 'A',
      width: 4,
      height: 1,
      palette: { k: 'std:k' },
      rows: ['kkkk'],
    };
    const charts = new Map([['a', chart]]);
    const layout = [
      { kind: 'chart' as const, placementId: 'a1', chartId: 'a' },
      { kind: 'chart' as const, placementId: 'a2', chartId: 'a' },
    ];
    const marker = { kind: 'marker' as const, id: 'm' };
    expect(placeMarker(layout, charts, 2, [4, 4], marker)?.map((s) => s.kind)).toEqual([
      'chart',
      'marker',
      'chart',
    ]);
    expect(placeMarker(layout, charts, 2, [2, 6], marker)).toBeNull(); // different segments
    expect(placeMarker(layout, charts, 1, [2], marker)).toBeNull(); // inside a full-width chart
    expect(placeMarker(layout, charts, 1, [99], marker)).toBeNull();
  });
});

// Local check: the real description + the recognised charts give the golden layout of size M.
const FULL = new URL('../../../inspirations/ocean-ropes-full.pdf', import.meta.url);
const GOLDEN = new URL('../../../local/golden/ocean-ropes.ktpattern.json', import.meta.url);
describe.skipIf(!existsSync(FULL) || !existsSync(GOLDEN))(
  'local: Ocean Ropes layout from its description',
  () => {
    it('reproduces the golden stage for every size', async () => {
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
      const golden = (JSON.parse(readFileSync(GOLDEN, 'utf8')) as { pattern: Pattern }).pattern;
      const r = await importPdf(pdfjs, new Uint8Array(readFileSync(FULL)));
      const d = r.description;
      const p = buildPattern({
        id: 'x',
        title: 'x',
        sizes: d.sizes?.value ?? [],
        charts: golden.charts.map((c) => ({ name: c.name, rows: chartToSymbolRows(c) })),
        legend: [],
        stageName: 'Korpus',
        sequence: d.sequence?.value ?? [],
        stitchCount: d.stitchCount?.value ?? [],
        marker: d.marker?.value ?? [],
        sectionNames: ['Przód', 'Tył'],
      });
      for (let size = 0; size < golden.sizes.length; size++) {
        const a = resolveStage(p, 'stage-1', size);
        const b = resolveStage(golden, 'body', size);
        expect(a.stitchCount).toBe(b.stitchCount);
        expect(a.markers.map((m) => m.afterStitch)).toEqual(b.markers.map((m) => m.afterStitch));
        for (let row = 1; row <= 44; row++) {
          for (let stitch = 1; stitch <= a.stitchCount; stitch++) {
            expect(a.cellAtStitch(row, stitch).symbolId).toBe(b.cellAtStitch(row, stitch).symbolId);
          }
        }
      }
    }, 60_000);
  },
);
