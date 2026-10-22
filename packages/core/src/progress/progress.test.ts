import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decrease,
  makeProject,
  roundPattern,
  seed,
  type PatternInput,
} from '../__tests__/fixtures';
import { resolvePattern } from '../layout/resolve';
import type { Project } from '../schema/pattern';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  initialProgress,
  reduceProgress,
  type ProgressState,
} from './actions';
import {
  createRowModel,
  indexOfCol,
  indexOfStitch,
  lastDone,
  nextStitch,
  stitchAt,
  summarize,
} from './position';

const pattern = makeProject();
const round = createRowModel(resolvePattern(pattern, 'body', { sizeIndex: 0 })); // 26 stitches × 12 rows
const flat = createRowModel(resolvePattern(pattern, 'back', { sizeIndex: 0 })); // 7 stitches, open-ended, starts on WS

describe('row model and stitch locations', () => {
  it('counts rows and totals for planned stages', () => {
    expect(round.rowLength(1)).toBe(26);
    expect(round.rowStart(1)).toBe(0);
    expect(round.rowStart(3)).toBe(52);
    expect(round.total()).toBe(26 * 12);
    expect(flat.total()).toBeNull();
    expect(() => round.rowStart(0)).toThrow(RangeError);
  });

  it('uses the prototype numbering in the round: index = (row - 1) × n + stitch', () => {
    for (const [row, stitch] of [
      [1, 1],
      [1, 26],
      [2, 1],
      [7, 13],
      [12, 26],
    ] as const) {
      const index = (row - 1) * 26 + stitch;
      expect(indexOfStitch(round, row, stitch)).toBe(index);
      expect(stitchAt(round, index)).toMatchObject({
        row,
        stitch,
        work: stitch,
        side: 'RS',
        col: 27 - stitch,
      });
    }
  });

  it('works WS rows left to right in the RS view', () => {
    // Row 1 is WS: first worked stitch is stitch 7 = display column 1.
    expect(stitchAt(flat, 1)).toMatchObject({ row: 1, work: 1, stitch: 7, col: 1, side: 'WS' });
    expect(stitchAt(flat, 7)).toMatchObject({ row: 1, work: 7, stitch: 1, col: 7 });
    // Row 2 is RS: right to left again.
    expect(stitchAt(flat, 8)).toMatchObject({ row: 2, work: 1, stitch: 1, col: 7, side: 'RS' });
    expect(indexOfCol(flat, 1, 1)).toBe(1);
    expect(indexOfCol(flat, 2, 7)).toBe(8);
  });

  it('skips "no stitch" cells in the work order', () => {
    const p: Project = makeProject({
      patterns: [
        {
          id: 'dec',
          name: 'Dec',
          construction: 'round',
          firstRowSide: 'RS',
          layout: [{ kind: 'chart', placementId: 'd', chartId: decrease.id }],
          rows: 2,
        },
      ],
    });
    const m = createRowModel(resolvePattern(p, 'dec', { sizeIndex: 0 }));
    // Row 1: k2tog k k [none]; row 2: [none] k k k.
    expect(m.workOrder(1)).toEqual([2, 3, 4]);
    expect(m.workOrder(2)).toEqual([1, 2, 3]);
    expect(m.total()).toBe(6);
    expect(indexOfStitch(m, 1, 1)).toBeNull(); // the no-stitch cell
    expect(indexOfStitch(m, 2, 3)).toBe(6);
  });

  it('returns null outside the stage', () => {
    expect(stitchAt(round, 0)).toBeNull();
    expect(stitchAt(round, 26 * 12 + 1)).toBeNull();
    expect(stitchAt(round, 1.5)).toBeNull();
    expect(indexOfStitch(round, 13, 1)).toBeNull();
    expect(indexOfStitch(round, 0, 1)).toBeNull();
    expect(indexOfStitch(round, 1, 27)).toBeNull();
    expect(lastDone(round, 0)).toBeNull();
    expect(nextStitch(round, 26 * 12)).toBeNull();
  });

  it('handles open-ended stages far ahead', () => {
    expect(stitchAt(flat, 7 * 500 + 3)).toMatchObject({ row: 501, work: 3 });
  });

  it('summarizes progress', () => {
    expect(summarize(round, 0)).toMatchObject({
      rowsCompleted: 0,
      currentRow: 1,
      doneInCurrentRow: 0,
      percent: 0,
    });
    expect(summarize(round, 30)).toMatchObject({
      rowsCompleted: 1,
      currentRow: 2,
      doneInCurrentRow: 4,
    });
    expect(summarize(round, 26)).toMatchObject({
      rowsCompleted: 1,
      currentRow: 2,
      doneInCurrentRow: 0,
    });
    const end = summarize(round, 26 * 12);
    expect(end).toMatchObject({
      rowsCompleted: 12,
      currentRow: 12,
      doneInCurrentRow: 26,
      percent: 100,
      next: null,
    });
    expect(summarize(flat, 10).percent).toBeNull();
  });

  it('property: index ↔ (row, stitch) is a bijection for random layouts', () => {
    const stageArb = fc.record({
      widths: fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 5 }),
      construction: fc.constantFrom('round' as const, 'flat' as const),
      firstRowSide: fc.constantFrom('RS' as const, 'WS' as const),
      rows: fc.integer({ min: 1, max: 8 }),
    });
    fc.assert(
      fc.property(stageArb, ({ widths, construction, firstRowSide, rows }) => {
        const stage: PatternInput = {
          id: 's',
          name: 'S',
          construction,
          firstRowSide,
          layout: widths.map((w, i) => ({
            kind: 'chart' as const,
            placementId: `p${i}`,
            chartId: seed.id,
            stitches: w,
          })),
          rows,
        };
        const m = createRowModel(
          resolvePattern(makeProject({ patterns: [stage] }), 's', { sizeIndex: 0 }),
        );
        const n = widths.reduce((a, b) => a + b, 0);
        expect(m.total()).toBe(n * rows);
        for (let index = 1; index <= n * rows; index++) {
          const loc = stitchAt(m, index);
          if (!loc) return false;
          if (indexOfStitch(m, loc.row, loc.stitch) !== index) return false;
          // WS rows run the opposite way to RS rows.
          const expectedStitch = loc.side === 'RS' ? loc.work : n - loc.work + 1;
          if (loc.stitch !== expectedStitch) return false;
        }
        return true;
      }),
      { numRuns: 60 },
    );
  });
});

describe('progress reducer', () => {
  const act = (s: ProgressState, ...actions: Parameters<typeof reduceProgress>[1][]) =>
    actions.reduce((acc, a) => reduceProgress(acc, a, round), s);

  it('marks a stitch and everything before it; ignores taps on done stitches', () => {
    const s = act(initialProgress, { type: 'tap', index: 10, mode: 'mark' });
    expect(s.done).toBe(10);
    expect(act(s, { type: 'tap', index: 4, mode: 'mark' })).toBe(s);
    expect(act(s, { type: 'tap', index: 0, mode: 'mark' })).toBe(s);
    expect(act(s, { type: 'tap', index: 2.5, mode: 'mark' })).toBe(s);
  });

  it('erases back to the tapped stitch; tapping the last done stitch un-marks it', () => {
    const s = act(initialProgress, { type: 'tap', index: 10, mode: 'mark' });
    expect(act(s, { type: 'tap', index: 4, mode: 'erase' }).done).toBe(4);
    expect(act(s, { type: 'tap', index: 10, mode: 'erase' }).done).toBe(9);
    expect(act(s, { type: 'tap', index: 12, mode: 'erase' })).toBe(s);
  });

  it('completes the current row, or the next one when the row is already complete', () => {
    expect(act(initialProgress, { type: 'completeRow' }).done).toBe(26);
    expect(act(initialProgress, { type: 'set', done: 30 }, { type: 'completeRow' }).done).toBe(52);
    expect(act(initialProgress, { type: 'set', done: 52 }, { type: 'completeRow' }).done).toBe(78);
    const end = act(initialProgress, { type: 'set', done: 9999 });
    expect(end.done).toBe(26 * 12);
    expect(act(end, { type: 'completeRow' })).toBe(end);
  });

  it('clamps marks to the end of a planned stage and to zero', () => {
    expect(act(initialProgress, { type: 'tap', index: 10_000, mode: 'mark' }).done).toBe(26 * 12);
    expect(act(initialProgress, { type: 'set', done: -5 }).done).toBe(0);
  });

  it('undoes and redoes, and a new action clears redo', () => {
    const s = act(
      initialProgress,
      { type: 'tap', index: 5, mode: 'mark' },
      { type: 'tap', index: 9, mode: 'mark' },
      { type: 'undo' },
    );
    expect(s.done).toBe(5);
    expect(canRedo(s)).toBe(true);
    expect(act(s, { type: 'redo' }).done).toBe(9);
    const branched = act(s, { type: 'tap', index: 7, mode: 'mark' });
    expect(canRedo(branched)).toBe(false);
    expect(act(initialProgress, { type: 'undo' })).toBe(initialProgress);
    expect(act(initialProgress, { type: 'redo' })).toBe(initialProgress);
    expect(canUndo(initialProgress)).toBe(false);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps and at least the 300 the spec requires`, () => {
    let s = initialProgress;
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++)
      s = reduceProgress(
        s,
        { type: 'tap', index: i % 300 === 0 ? 1 : i, mode: 'mark' },
        createRowModel(
          resolvePattern(makeProject({ patterns: [{ ...roundPattern, rows: 100 }] }), 'body', {
            sizeIndex: 0,
          }),
        ),
      );
    expect(s.undo.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(s.undo.length).toBeGreaterThanOrEqual(300);
  });

  it('property: any action sequence keeps done within bounds and undo ∘ action = identity', () => {
    const action = fc.oneof(
      fc.record({
        type: fc.constant('tap' as const),
        index: fc.integer({ min: -3, max: 400 }),
        mode: fc.constantFrom('mark' as const, 'erase' as const),
      }),
      fc.constant({ type: 'completeRow' as const }),
      fc.record({ type: fc.constant('set' as const), done: fc.integer({ min: -10, max: 400 }) }),
      fc.constant({ type: 'undo' as const }),
      fc.constant({ type: 'redo' as const }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        let s = initialProgress;
        for (const a of actions) {
          const next = reduceProgress(s, a, round);
          if (next.done < 0 || next.done > 26 * 12) return false;
          if (next !== s && a.type !== 'undo' && a.type !== 'redo') {
            // Every recorded change can be undone back to the previous value.
            if (reduceProgress(next, { type: 'undo' }, round).done !== s.done) return false;
          }
          s = next;
        }
        return true;
      }),
    );
  });
});
