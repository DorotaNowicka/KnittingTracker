import { describe, expect, it } from 'vitest';
import { flatStage, makePattern, roundStage } from '../__tests__/fixtures';
import { continueStage, moveStage, removeStage } from '../authoring/pattern';
import type { Pattern, Stage } from '../schema/pattern';
import { resolveStage, stageRows } from './resolve';

/** Body (12 rounds; rope r2 starts at chart row 4) → front (continues r2) → yoke (continues front). */
function chain(frontRows?: number): Pattern {
  const front: Stage = {
    id: 'front',
    name: 'Front',
    construction: 'flat',
    firstRowSide: 'WS',
    layout: [
      {
        kind: 'chart',
        placementId: 'fr',
        chartId: 'rope',
        continueFrom: { stageId: 'body', placementId: 'r2' },
      },
    ],
    ...(frontRows === undefined ? {} : { rows: frontRows }),
  };
  const yoke: Stage = {
    id: 'yoke',
    name: 'Yoke',
    construction: 'flat',
    firstRowSide: 'RS',
    layout: [
      {
        kind: 'chart',
        placementId: 'y',
        chartId: 'rope',
        continueFrom: { stageId: 'front', placementId: 'fr' },
      },
    ],
    rows: 4,
  };
  return makePattern({ stages: [roundStage, front, yoke] });
}

describe('chart phase continuation (DR-3)', () => {
  it('starts with the chart row after the last one worked in the earlier stage', () => {
    const p = chain(5);
    // Body r2: offset 3, 12 rounds → last chart row ((12 - 1 + 3) mod 6) + 1 = 3; next is 4.
    const body = resolveStage(p, 'body', 0);
    const r2 = body.zones.find((z) => z.placementId === 'r2');
    expect(r2 && body.cellAtStitch(12, r2.firstStitch).chartRow).toBe(3);
    const front = resolveStage(p, 'front', 0);
    expect(front.zones[0]?.rowOffset).toBe((3 + 12) % 6);
    expect(front.cellAtStitch(1, 1).chartRow).toBe(4);
    expect(front.zones[0]?.continued).toEqual({ stageId: 'body', placementId: 'r2', known: true });
    // Chains: yoke continues the front, which continued the body.
    const yoke = resolveStage(p, 'yoke', 0);
    expect(yoke.cellAtStitch(1, 1).chartRow).toBe(((3 + 12 + 5) % 6) + 1);
  });

  it('waits for an open-ended stage to be finished, then uses the rows actually worked', () => {
    const p = chain();
    const yoke = resolveStage(p, 'yoke', 0);
    expect(yoke.zones[0]?.continued?.known).toBe(false);
    expect(yoke.diagnostics.map((d) => [d.code, d.severity])).toContainEqual([
      'continue-unknown',
      'info',
    ]);
    expect(stageRows(p, 'front', 0)).toBeNull();
    const finished = resolveStage(p, 'yoke', 0, { finishedRows: { front: 7 } });
    expect(finished.zones[0]?.continued?.known).toBe(true);
    expect(finished.cellAtStitch(1, 1).chartRow).toBe(((3 + 12 + 7) % 6) + 1);
    // A recorded finish also overrides planned rows (the knitter stopped early).
    expect(stageRows(p, 'body', 0, { body: 10 })).toBe(10);
  });

  it('reports missing sources and cycles as errors', () => {
    const p = chain(5);
    const loop: Pattern = {
      ...p,
      stages: p.stages.map((s) =>
        s.id === 'front'
          ? {
              ...s,
              layout: [
                {
                  kind: 'chart',
                  placementId: 'fr',
                  chartId: 'rope',
                  continueFrom: { stageId: 'yoke', placementId: 'y' },
                },
              ],
            }
          : s,
      ),
    };
    expect(resolveStage(loop, 'yoke', 0).diagnostics.map((d) => d.code)).toContain(
      'continue-cycle',
    );
    const missing: Pattern = {
      ...p,
      stages: p.stages.map((s) =>
        s.id === 'yoke'
          ? {
              ...s,
              layout: [
                {
                  kind: 'chart',
                  placementId: 'y',
                  chartId: 'rope',
                  continueFrom: { stageId: 'front', placementId: 'nope' },
                },
              ],
            }
          : s,
      ),
    };
    expect(resolveStage(missing, 'yoke', 0).diagnostics.map((d) => d.code)).toContain(
      'continue-missing',
    );
  });
});

describe('stage authoring for layout changes', () => {
  it('continues a stage in a new one right after it, linking every chart placement', () => {
    const p = makePattern({ stages: [roundStage, flatStage] });
    const { pattern, stageId } = continueStage(p, 'body', 'Body (decreases)');
    expect(pattern.stages.map((s) => s.id)).toEqual(['body', stageId, 'back']);
    const next = pattern.stages[1];
    if (!next) throw new Error('missing stage');
    expect(next.construction).toBe('round');
    expect(next.rows).toBeUndefined();
    const charts = next.layout.filter((s) => s.kind === 'chart');
    expect(charts).toHaveLength(roundStage.layout.filter((s) => s.kind === 'chart').length);
    for (const seg of charts) {
      expect(seg.continueFrom).toEqual({ stageId: 'body', placementId: seg.placementId });
      expect(seg.rowOffset).toBeUndefined();
    }
    // r2 started at chart row 4 in the body: after 12 rounds it continues at chart row 4 again.
    const resolved = resolveStage(pattern, stageId, 0);
    expect(resolved.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(resolved.zones.find((z) => z.placementId === 'r2')?.rowOffset).toBe(3);

    // Removing the source keeps the new stage valid (links dropped), and stages can be reordered.
    const removed = removeStage(pattern, 'body');
    expect(removed.stages[0]?.layout.some((s) => s.kind === 'chart' && s.continueFrom)).toBe(false);
    expect(moveStage(pattern, 2, 0).stages.map((s) => s.id)).toEqual(['back', 'body', stageId]);
  });
});
