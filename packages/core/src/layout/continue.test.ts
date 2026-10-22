import { describe, expect, it } from 'vitest';
import { flatPattern, legend, makeProject, rope, roundPattern } from '../__tests__/fixtures';
import { continuePattern, movePattern, removePattern } from '../authoring/pattern';
import type { Pattern, Project } from '../schema/pattern';
import { patternRows, resolvePattern } from './resolve';

const own = { charts: [rope], symbols: [], legend };

/** Body (12 rounds; rope r2 starts at chart row 4) → front (continues r2) → yoke (continues front). */
function chain(frontRows?: number): Project {
  const front: Pattern = {
    id: 'front',
    name: 'Front',
    construction: 'flat',
    firstRowSide: 'WS',
    ...own,
    layout: [
      {
        kind: 'chart',
        placementId: 'fr',
        chartId: 'rope',
        continueFrom: { patternId: 'body', placementId: 'r2' },
      },
    ],
    ...(frontRows === undefined ? {} : { rows: frontRows }),
  };
  const yoke: Pattern = {
    id: 'yoke',
    name: 'Yoke',
    construction: 'flat',
    firstRowSide: 'RS',
    ...own,
    layout: [
      {
        kind: 'chart',
        placementId: 'y',
        chartId: 'rope',
        continueFrom: { patternId: 'front', placementId: 'fr' },
      },
    ],
    rows: 4,
  };
  return makeProject({ patterns: [roundPattern, front, yoke] });
}

describe('chart phase continuation (DR-3)', () => {
  it('starts with the chart row after the last one worked in the earlier pattern', () => {
    const p = chain(5);
    // Body r2: offset 3, 12 rounds → last chart row ((12 - 1 + 3) mod 6) + 1 = 3; next is 4.
    const body = resolvePattern(p, 'body', { sizeIndex: 0 });
    const r2 = body.zones.find((z) => z.placementId === 'r2');
    expect(r2 && body.cellAtStitch(12, r2.firstStitch).chartRow).toBe(3);
    const front = resolvePattern(p, 'front', { sizeIndex: 0 });
    expect(front.zones[0]?.rowOffset).toBe((3 + 12) % 6);
    expect(front.cellAtStitch(1, 1).chartRow).toBe(4);
    expect(front.zones[0]?.continued).toEqual({
      patternId: 'body',
      placementId: 'r2',
      known: true,
    });
    // Chains: yoke continues the front, which continued the body.
    const yoke = resolvePattern(p, 'yoke', { sizeIndex: 0 });
    expect(yoke.cellAtStitch(1, 1).chartRow).toBe(((3 + 12 + 5) % 6) + 1);
  });

  it('waits for an open-ended pattern to be finished, then uses the rows actually worked', () => {
    const p = chain();
    const yoke = resolvePattern(p, 'yoke', { sizeIndex: 0 });
    expect(yoke.zones[0]?.continued?.known).toBe(false);
    expect(yoke.diagnostics.map((d) => [d.code, d.severity])).toContainEqual([
      'continue-unknown',
      'info',
    ]);
    expect(patternRows(p, 'front')).toBeNull();
    const finished = resolvePattern({ ...p, finishedRows: { front: 7 } }, 'yoke');
    expect(finished.zones[0]?.continued?.known).toBe(true);
    expect(finished.cellAtStitch(1, 1).chartRow).toBe(((3 + 12 + 7) % 6) + 1);
    // A recorded finish also overrides planned rows (the knitter stopped early).
    expect(patternRows({ ...p, finishedRows: { body: 10 } }, 'body')).toBe(10);
  });

  it('reports missing sources and cycles as errors', () => {
    const p = chain(5);
    const loop: Project = {
      ...p,
      patterns: p.patterns.map((s) =>
        s.id === 'front'
          ? {
              ...s,
              layout: [
                {
                  kind: 'chart',
                  placementId: 'fr',
                  chartId: 'rope',
                  continueFrom: { patternId: 'yoke', placementId: 'y' },
                },
              ],
            }
          : s,
      ),
    };
    expect(resolvePattern(loop, 'yoke', { sizeIndex: 0 }).diagnostics.map((d) => d.code)).toContain(
      'continue-cycle',
    );
    const missing: Project = {
      ...p,
      patterns: p.patterns.map((s) =>
        s.id === 'yoke'
          ? {
              ...s,
              layout: [
                {
                  kind: 'chart',
                  placementId: 'y',
                  chartId: 'rope',
                  continueFrom: { patternId: 'front', placementId: 'nope' },
                },
              ],
            }
          : s,
      ),
    };
    expect(
      resolvePattern(missing, 'yoke', { sizeIndex: 0 }).diagnostics.map((d) => d.code),
    ).toContain('continue-missing');
  });
});

describe('pattern authoring for layout changes', () => {
  it('continues a pattern in a new one right after it, linking every chart placement', () => {
    const p = makeProject({ patterns: [roundPattern, flatPattern] });
    const { project, patternId } = continuePattern(p, 'body', 'Body (decreases)');
    expect(project.patterns.map((s) => s.id)).toEqual(['body', patternId, 'back']);
    const next = project.patterns[1];
    if (!next) throw new Error('missing pattern');
    // The new pattern carries its own copy of the charts.
    expect(next.charts).toEqual(roundPattern.charts);
    expect(next.construction).toBe('round');
    expect(next.rows).toBeUndefined();
    const charts = next.layout.filter((s) => s.kind === 'chart');
    expect(charts).toHaveLength(roundPattern.layout.filter((s) => s.kind === 'chart').length);
    for (const seg of charts) {
      expect(seg.continueFrom).toEqual({ patternId: 'body', placementId: seg.placementId });
      expect(seg.rowOffset).toBeUndefined();
    }
    // r2 started at chart row 4 in the body: after 12 rounds it continues at chart row 4 again.
    const resolved = resolvePattern(project, patternId, { sizeIndex: 0 });
    expect(resolved.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(resolved.zones.find((z) => z.placementId === 'r2')?.rowOffset).toBe(3);

    // Removing the source keeps the new pattern valid (links dropped), and patterns can be
    // reordered.
    const removed = removePattern({ ...project, finishedRows: { body: 12 } }, 'body');
    expect(removed.patterns[0]?.layout.some((s) => s.kind === 'chart' && s.continueFrom)).toBe(
      false,
    );
    expect(removed.finishedRows).toBeUndefined();
    expect(removed.activePatternId).toBe(patternId);
    expect(movePattern(project, 2, 0).patterns.map((s) => s.id)).toEqual([
      'back',
      'body',
      patternId,
    ]);
  });
});
