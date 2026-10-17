import { describe, expect, it } from 'vitest';
import { makePattern } from '../__tests__/fixtures';
import { resolveStage } from '../layout/resolve';
import type { Stage } from '../schema/pattern';
import { initialProgress, reduceProgress } from './actions';
import { lengthEstimate, effectiveGauge, rowsForCm, cmForRows } from './estimate';
import { createProgressModel, indexOfCol, summarize } from './position';

const rib: Stage = {
  id: 'rib',
  name: 'Rib',
  construction: 'round',
  firstRowSide: 'RS',
  tracking: 'rows',
  layout: [{ kind: 'marker', id: 'start' }],
  rows: 10,
};

describe('row-counter stages (DR-9)', () => {
  it('count whole rows with the same actions as stitch tracking', () => {
    const p = makePattern({ stages: [rib] });
    const stage = resolveStage(p, 'rib', 0);
    // No layout is needed for a row counter.
    expect(stage.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const model = createProgressModel(stage);
    expect(model.unit).toBe('row');
    let s = reduceProgress(initialProgress, { type: 'completeRow' }, model);
    s = reduceProgress(s, { type: 'completeRow' }, model);
    expect(summarize(model, s.done)).toMatchObject({
      done: 2,
      rowsCompleted: 2,
      currentRow: 3,
      percent: 20,
    });
    s = reduceProgress(s, { type: 'set', done: 50 }, model);
    expect(s.done).toBe(10);
    expect(summarize(model, s.done).next).toBeNull();
    s = reduceProgress(s, { type: 'undo' }, model);
    expect(s.done).toBe(2);
    // Tapping any cell of a row counts up to that row.
    expect(indexOfCol(model, 7, 1)).toBe(7);
    expect(indexOfCol(model, 11, 1)).toBeNull();
  });

  it('stitch-tracked stages keep the stitch model', () => {
    const stage = resolveStage(makePattern(), 'body', 0);
    expect(createProgressModel(stage).unit).toBe('stitch');
  });
});

describe('length estimates (DR-5)', () => {
  const open: Stage = { ...rib, tracking: 'rows', targetCm: [30, 34.5] };
  const { rows: _planned, ...openEnded } = open;

  it('turn the target length into rows with the gauge', () => {
    const p = makePattern({ stages: [openEnded], gauge: { stitches: 22, rows: 30 } });
    const stage = resolveStage(p, 'rib', 1);
    expect(stage.plannedRows).toBeNull();
    const gauge = effectiveGauge(p, null);
    expect(lengthEstimate(stage, 30, gauge)).toEqual({
      targetCm: 34.5,
      targetRows: 104,
      doneCm: 10,
      rowsLeft: 74,
    });
    // The knitter's own gauge wins; without any gauge only the target is known.
    expect(effectiveGauge(p, { gauge: { stitches: 20, rows: 28 } })).toEqual({
      stitches: 20,
      rows: 28,
    });
    const noGauge = makePattern({ stages: [openEnded] });
    expect(lengthEstimate(resolveStage(noGauge, 'rib', 0), 5, effectiveGauge(noGauge))).toEqual({
      targetCm: 30,
      targetRows: null,
      doneCm: null,
      rowsLeft: null,
    });
    expect(rowsForCm(10, { stitches: 1, rows: 32 })).toBe(32);
    expect(cmForRows(16, { stitches: 1, rows: 32 })).toBe(5);
  });
});
