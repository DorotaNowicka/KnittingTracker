import { describe, expect, it } from 'vitest';
import { makeProject, roundPattern, stockinette, withPattern } from '../__tests__/fixtures';
import type { Modification, Project } from '../schema/pattern';
import { effectiveCharts, findPattern, patternRows, resolvePattern } from './resolve';

const pattern = makeProject();
const { expectedStitches: _unused, ...roundWithoutCount } = roundPattern;
const flat = findPattern(pattern, 'back');
if (!flat) throw new Error('fixture without flat pattern');

describe('resolvePattern — horizontal layout', () => {
  it('lays segments out in work order with stitch 1 at the right edge', () => {
    const s = resolvePattern(pattern, 'body', { sizeIndex: 0 });
    expect(s.stitchCount).toBe(26);
    expect(s.diagnostics).toEqual([]);
    expect(s.zones.map((z) => [z.placementId, z.firstStitch, z.lastStitch])).toEqual([
      ['f1', 1, 5],
      ['r1', 6, 11],
      ['z1', 12, 15],
      ['r2', 16, 21],
      ['f2', 22, 26],
    ]);
    // Display columns mirror stitch numbers: stitch 1 ↔ column 26.
    const f1 = s.zones[0];
    expect([f1?.firstCol, f1?.lastCol]).toEqual([22, 26]);
    expect(s.cellAtStitch(1, 1).col).toBe(26);
    expect(s.cellAtCol(1, 26).stitch).toBe(1);
  });

  it('resolves per-size stitch counts', () => {
    expect(resolvePattern(pattern, 'body', { sizeIndex: 1 }).stitchCount).toBe(30);
  });

  it('starts a chart at its rightmost column and wraps left for partial repeats', () => {
    const s = resolvePattern(pattern, 'body', { sizeIndex: 0 });
    // Seed (2 wide) over 5 stitches: chart columns 2,1,2,1,2 in work order.
    expect([1, 2, 3, 4, 5].map((st) => s.cellAtStitch(1, st).chartCol)).toEqual([2, 1, 2, 1, 2]);
    // Rope zone: stitch 6 is the first worked = chart column 6 (rightmost).
    expect(s.cellAtStitch(1, 6).chartCol).toBe(6);
    expect(s.cellAtStitch(1, 11).chartCol).toBe(1);
  });

  it('honours an explicit start column', () => {
    const p: Project = makeProject({
      patterns: [
        {
          ...roundPattern,
          expectedStitches: 3,
          layout: [
            { kind: 'chart', placementId: 'a', chartId: 'seed', stitches: 3, startColumn: 1 },
          ],
        },
      ],
    });
    const s = resolvePattern(p, 'body', { sizeIndex: 0 });
    expect([1, 2, 3].map((st) => s.cellAtStitch(1, st).chartCol)).toEqual([1, 2, 1]);
  });

  it('repeats each chart vertically with its own height and row offset', () => {
    const s = resolvePattern(pattern, 'body', { sizeIndex: 0 });
    // Rope (height 6) in zone r1 without offset; r2 with offset 3.
    expect([1, 6, 7, 12].map((r) => s.cellAtStitch(r, 6).chartRow)).toEqual([1, 6, 1, 6]);
    expect([1, 4, 7].map((r) => s.cellAtStitch(r, 16).chartRow)).toEqual([4, 1, 4]);
    // Zigzag (height 4).
    expect([1, 4, 5].map((r) => s.cellAtStitch(r, 12).chartRow)).toEqual([1, 4, 1]);
  });

  it('places markers and named sections', () => {
    const s = resolvePattern(pattern, 'body', { sizeIndex: 0 });
    expect(s.markers).toEqual([
      { id: 'start', afterStitch: 0 },
      { id: 'side', afterStitch: 15 },
    ]);
    expect(s.sections).toEqual([
      { name: 'Front', firstStitch: 1, lastStitch: 15 },
      { name: 'Back', firstStitch: 16, lastStitch: 26 },
    ]);
  });

  it('knows which side faces the knitter', () => {
    const round = resolvePattern(pattern, 'body', { sizeIndex: 0 });
    expect([1, 2, 3].map(round.side)).toEqual(['RS', 'RS', 'RS']);
    const flatGrid = resolvePattern(pattern, 'back', { sizeIndex: 0 });
    expect([1, 2, 3].map(flatGrid.side)).toEqual(['WS', 'RS', 'WS']);
    const p = makeProject({ patterns: [{ ...flat, firstRowSide: 'RS' }] });
    expect([1, 2].map(resolvePattern(p, 'back', { sizeIndex: 0 }).side)).toEqual(['RS', 'WS']);
  });

  it('reports planned rows or null for open-ended patterns', () => {
    expect(resolvePattern(pattern, 'body', { sizeIndex: 0 }).plannedRows).toBe(12);
    expect(resolvePattern(pattern, 'back', { sizeIndex: 0 }).plannedRows).toBeNull();
    expect(patternRows(pattern, 'body')).toBe(12);
    expect(patternRows({ ...pattern, finishedRows: { back: 7 } }, 'back')).toBe(7);
    expect(patternRows(pattern, 'back')).toBeNull();
    expect(patternRows(pattern, 'nope')).toBeNull();
  });

  it('uses the project size unless another one is asked for', () => {
    expect(resolvePattern({ ...pattern, sizeIndex: 1 }, 'body').stitchCount).toBe(30);
    expect(resolvePattern({ ...pattern, sizeIndex: 1 }, 'body', { sizeIndex: 0 }).stitchCount).toBe(
      26,
    );
  });
});

describe('resolvePattern — modifications (DR-1)', () => {
  const replaceSeed: Modification = {
    kind: 'replaceChart',
    chartId: 'seed',
    chart: { ...stockinette, id: 'ignored' },
  };

  it('replaces chart content but keeps the layout width', () => {
    const changed = withPattern(pattern, 'body', { modifications: [replaceSeed] });
    const s = resolvePattern(changed, 'body', { sizeIndex: 0 });
    expect(s.stitchCount).toBe(26);
    expect([1, 2, 3, 4, 5].map((st) => s.cellAtStitch(1, st).symbolId)).toEqual(
      Array(5).fill('std:k'),
    );
    // The chart itself is untouched.
    expect(resolvePattern(pattern, 'body', { sizeIndex: 0 }).cellAtStitch(1, 2).symbolId).toBe(
      'std:k',
    );
    expect(resolvePattern(pattern, 'body', { sizeIndex: 0 }).cellAtStitch(1, 1).symbolId).toBe(
      'std:p',
    );
  });

  it('ignores modifications for unknown charts', () => {
    const charts = effectiveCharts({
      ...roundPattern,
      modifications: [{ ...replaceSeed, chartId: 'nope' }],
    });
    expect(charts.get('seed')).toEqual(roundPattern.charts[0]);
  });
});

describe('resolvePattern — problems', () => {
  it('reports a stitch count that disagrees with the pattern text', () => {
    const p = makeProject({ patterns: [{ ...roundPattern, expectedStitches: [27, 30] }] });
    expect(resolvePattern(p, 'body', { sizeIndex: 0 }).diagnostics.map((d) => d.code)).toEqual([
      'stitch-count',
    ]);
  });

  it('reports unknown charts and bad start columns', () => {
    const p = makeProject({
      patterns: [
        {
          ...roundWithoutCount,
          layout: [
            { kind: 'chart', placementId: 'a', chartId: 'missing' },
            { kind: 'chart', placementId: 'b', chartId: 'seed', startColumn: 9 },
            { kind: 'chart', placementId: 'c', chartId: 'seed', stitches: 0 },
          ],
        },
      ],
    });
    const s = resolvePattern(p, 'body', { sizeIndex: 0 });
    expect(s.diagnostics.map((d) => d.code)).toEqual(['unknown-chart', 'start-column']);
    expect(s.stitchCount).toBe(2);
  });

  it('throws for programming errors', () => {
    expect(() => resolvePattern(pattern, 'nope', { sizeIndex: 0 })).toThrow(/Unknown pattern/);
    expect(() => resolvePattern(pattern, 'body', { sizeIndex: 2 })).toThrow(RangeError);
    const s = resolvePattern(pattern, 'body', { sizeIndex: 0 });
    expect(() => s.cellAtStitch(0, 1)).toThrow(RangeError);
    expect(() => s.cellAtStitch(1, 27)).toThrow(RangeError);
    expect(() => s.cellAtStitch(1, 0)).toThrow(RangeError);
  });
});
