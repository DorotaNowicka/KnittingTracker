/**
 * Golden tests against a real pattern (Ocean Ropes, size M).
 *
 * The data is copyrighted, so it lives only in the git-ignored `local/golden/` folder (generated
 * by `local/golden/generate.mjs` from the prototype). Without it, this suite is skipped. In CI it
 * is always skipped, and that is expected.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseChart } from '../chart/parse';
import { readPatternFile } from '../io/file';
import { patternRegistry, resolveStage, type StageCell } from '../layout/resolve';
import { createRowModel, indexOfStitch, stitchAt } from '../progress/position';
import { modificationSchema, type Modification, type Pattern } from '../schema/pattern';
import { validateChart } from '../validate/chart';
import { validatePattern } from '../validate/pattern';

const dir = fileURLToPath(new URL('../../../../local/golden/', import.meta.url));
const files = {
  pattern: `${dir}ocean-ropes.ktpattern.json`,
  modifications: `${dir}ocean-ropes.modifications.json`,
  expected: `${dir}ocean-ropes-m.expected.json`,
};
const available = Object.values(files).every((f) => existsSync(f));

interface Expected {
  sizeIndex: number;
  stitchCount: number;
  markersAfter: number[];
  sections: { name: string; firstStitch: number; lastStitch: number }[];
  stitchCountsPerSize: number[];
  markerAfterPerSize: number[];
  charts: Record<'A.1' | 'A.2' | 'A.3' | 'A.4', string[]>;
  prototypeRows: Record<string, string>;
  controls: { a4Row1TriangleCols: number[]; a4Row20KnitCols: number[]; a4EdgePurls: number };
}

/** Prototype letters: k, p, X (218), L (201), R (202), A (302), B (306), Q (401), "." continuation. */
const LETTER: Record<string, string> = {
  'std:k': 'k',
  'std:p': 'p',
  'cable:1-1-rc': 'X',
  'cable:1-1-lpc': 'L',
  'cable:1-1-rpc': 'R',
  'cable:2-1-rpc': 'A',
  'cable:2-1-lpc': 'B',
  'cable:2-2-lc': 'Q',
};
const letter = (cell: StageCell) => (cell.part > 0 ? '.' : (LETTER[cell.symbolId] ?? '?'));

function load(): { pattern: Pattern; modifications: Modification[]; expected: Expected } {
  const read = readPatternFile(readFileSync(files.pattern, 'utf8'));
  if (!read.ok) throw new Error(read.errors.join('\n'));
  const modifications = modificationSchema
    .array()
    .parse(JSON.parse(readFileSync(files.modifications, 'utf8')));
  const expected = JSON.parse(readFileSync(files.expected, 'utf8')) as Expected;
  return { pattern: read.value, modifications, expected };
}

describe.skipIf(!available)('golden: Ocean Ropes M (local data)', () => {
  const { pattern, modifications, expected } = available
    ? load()
    : { pattern: undefined as never, modifications: [], expected: undefined as never };
  const M = () => resolveStage(pattern, 'body', expected.sizeIndex, { modifications });

  it('has 262 stitches with markers at the start and after stitch 131', () => {
    const s = M();
    expect(s.stitchCount).toBe(expected.stitchCount);
    expect(s.markers.map((m) => m.afterStitch)).toEqual(expected.markersAfter);
    expect(s.sections).toEqual(expected.sections);
    expect(s.diagnostics).toEqual([]);
  });

  it('matches the stitch counts and side markers of every size in the pattern text', () => {
    pattern.sizes.forEach((_, size) => {
      const s = resolveStage(pattern, 'body', size);
      expect(s.stitchCount).toBe(expected.stitchCountsPerSize[size]);
      expect(s.markers[1]?.afterStitch).toBe(expected.markerAfterPerSize[size]);
    });
  });

  it('charts A.2, A.3 and A.4 equal the transcription row by row', () => {
    const byId = new Map(pattern.charts.map((c) => [c.id, c]));
    for (const id of ['A.1', 'A.2', 'A.3', 'A.4'] as const) {
      expect(byId.get(id)?.rows).toEqual(expected.charts[id]);
    }
    const dims = pattern.charts.map((c) => `${c.id}:${c.width}x${c.height}`);
    expect(dims).toEqual(['A.1:3x9', 'A.2:14x22', 'A.3:8x9', 'A.4:44x20']);
  });

  it('passes the control values of the transcription', () => {
    const a4 = pattern.charts.find((c) => c.id === 'A.4');
    const row = (r: number) => [...(a4?.rows[r - 1] ?? '')];
    const cols = (r: number, pred: (ch: string) => boolean) =>
      row(r).flatMap((ch, i) => (pred(ch) ? [i + 1] : []));
    expect(cols(1, (ch) => ch === 'X' || ch === '.')).toEqual(expected.controls.a4Row1TriangleCols);
    expect(cols(20, (ch) => ch === 'k')).toEqual(expected.controls.a4Row20KnitCols);
    for (const r of [1, 20]) {
      expect(row(r).slice(0, expected.controls.a4EdgePurls).join('')).toBe('pppppp');
      expect(row(r).slice(-expected.controls.a4EdgePurls).join('')).toBe('pppppp');
    }
  });

  it('every cable sits on its stitches: no flow warnings in A.2 and A.4, only texture notes in A.3', () => {
    const reg = patternRegistry(pattern);
    for (const chart of pattern.charts) {
      const diags = validateChart(parseChart(chart, reg), reg);
      const notInfo = diags.filter((d) => d.severity !== 'info');
      expect(notInfo, chart.id).toEqual([]);
      if (chart.id === 'A.2' || chart.id === 'A.4') expect(diags, chart.id).toEqual([]);
    }
    const report = validatePattern(pattern, modifications);
    expect(report.ok).toBe(true);
  });

  it('with "A.1 → knit" every cell of rows 1–220 equals the prototype grid', () => {
    const s = M();
    const rows = Object.keys(expected.prototypeRows).length;
    const mismatches: string[] = [];
    for (let r = 1; r <= rows; r++) {
      const want = expected.prototypeRows[String(r)] ?? '';
      let got = '';
      for (let st = 1; st <= s.stitchCount; st++) got += letter(s.cellAtStitch(r, st));
      if (got !== want) mismatches.push(`row ${r}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('keeps the prototype stitch numbering: index = (row - 1) × 262 + stitch', () => {
    const model = createRowModel(M());
    for (const [row, stitch] of [
      [1, 1],
      [1, 131],
      [1, 132],
      [1, 262],
      [20, 77],
      [137, 200],
    ] as const) {
      const index = (row - 1) * 262 + stitch;
      expect(indexOfStitch(model, row, stitch)).toBe(index);
      expect(stitchAt(model, index)).toMatchObject({ row, stitch, col: 263 - stitch });
    }
  });

  it('places the real A.1 so each filler starts and ends with the chart first stitch', () => {
    const s = resolveStage(pattern, 'body', expected.sizeIndex);
    const a1 = s.zones.filter((z) => z.chartId === 'A.1');
    expect(a1.map((z) => z.lastStitch - z.firstStitch + 1)).toEqual([22, 21, 22, 21]);
    // Row 1 of A.1 is "ppk" (left → right): the first worked stitch is the knit column.
    const first = a1[0];
    if (!first) throw new Error('no A.1 zone');
    expect(s.cellAtStitch(1, first.firstStitch).chartCol).toBe(3);
    expect(s.cellAtStitch(1, first.lastStitch).chartCol).toBe(3);
    expect(s.cellAtStitch(1, first.firstStitch).symbolId).toBe('std:k');
    expect(s.cellAtStitch(1, first.firstStitch + 1).symbolId).toBe('std:p');
    // The middle filler (21 + 22 around the side marker) keeps one continuous 3-stitch rhythm.
    const middle = [a1[1], a1[2]];
    const cols = middle.flatMap((z) =>
      z
        ? Array.from(
            { length: z.lastStitch - z.firstStitch + 1 },
            (_, i) => s.cellAtStitch(1, z.firstStitch + i).chartCol,
          )
        : [],
    );
    expect(cols.every((c, i) => c === [3, 2, 1][i % 3])).toBe(true);
  });
});
