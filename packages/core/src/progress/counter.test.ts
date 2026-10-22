import { describe, expect, it } from 'vitest';
import { makeProject, type PatternInput } from '../__tests__/fixtures';
import { resolvePattern } from '../layout/resolve';
import { initialProgress, reduceProgress } from './actions';
import { lengthEstimate, effectiveGauge, rowsForCm, cmForRows } from './estimate';
import { createProgressModel, indexOfCol, summarize } from './position';

const rib: PatternInput = {
  id: 'rib',
  name: 'Rib',
  construction: 'round',
  firstRowSide: 'RS',
  tracking: 'rows',
  layout: [{ kind: 'marker', id: 'start' }],
  rows: 10,
};

describe('row-counter patterns (DR-9)', () => {
  it('count whole rows with the same actions as stitch tracking', () => {
    const p = makeProject({ patterns: [rib] });
    const stage = resolvePattern(p, 'rib', { sizeIndex: 0 });
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

  it('stitch-tracked patterns keep the stitch model', () => {
    const stage = resolvePattern(makeProject(), 'body', { sizeIndex: 0 });
    expect(createProgressModel(stage).unit).toBe('stitch');
  });
});

describe('length estimates (DR-5)', () => {
  const open: PatternInput = { ...rib, tracking: 'rows', targetCm: [30, 34.5] };
  const { rows: _planned, ...openEnded } = open;

  it('turn the target length into rows with the gauge', () => {
    const p = makeProject({ patterns: [openEnded], gauge: { stitches: 22, rows: 30 } });
    const stage = resolvePattern(p, 'rib', { sizeIndex: 1 });
    expect(stage.plannedRows).toBeNull();
    const gauge = effectiveGauge(p);
    expect(lengthEstimate(stage, 30, gauge)).toEqual({
      targetCm: 34.5,
      targetRows: 104,
      doneCm: 10,
      rowsLeft: 74,
    });
    // The knitter's own gauge wins; without any gauge only the target is known.
    expect(effectiveGauge({ ...p, knitterGauge: { stitches: 20, rows: 28 } })).toEqual({
      stitches: 20,
      rows: 28,
    });
    const noGauge = makeProject({ patterns: [openEnded] });
    expect(
      lengthEstimate(resolvePattern(noGauge, 'rib', { sizeIndex: 0 }), 5, effectiveGauge(noGauge)),
    ).toEqual({
      targetCm: 30,
      targetRows: null,
      doneCm: null,
      rowsLeft: null,
    });
    expect(rowsForCm(10, { stitches: 1, rows: 32 })).toBe(32);
    expect(cmForRows(16, { stitches: 1, rows: 32 })).toBe(5);
  });
});
