import { describe, expect, it } from 'vitest';
import { makePattern, rope } from '../__tests__/fixtures';
import { createHistory, pushHistory, redoHistory, replacePresent, undoHistory } from '../history';
import { resolveStage } from '../layout/resolve';
import { patternSchema, type Pattern } from '../schema/pattern';
import { validatePattern } from '../validate/pattern';
import {
  addChart,
  addSize,
  addStage,
  blankPattern,
  chartUsage,
  customSymbolId,
  duplicateChart,
  isUniform,
  moveItem,
  newChartSegment,
  newMarker,
  removeChart,
  removeCustomSymbol,
  removeSize,
  removeStage,
  renameSize,
  setLegendEntry,
  setSizeValue,
  sizeValueAt,
  uniqueId,
  updateChart,
  updateStage,
  upsertCustomSymbol,
  usedSymbolIds,
} from './pattern';

const fixturePattern = makePattern();
const blank = () =>
  blankPattern({ id: 'p', title: 'Test', sizes: ['S', 'M'], stageName: 'Korpus' });

describe('ids', () => {
  it('derives readable unique ids', () => {
    expect(uniqueId('A.1', [])).toBe('a-1');
    expect(uniqueId('A.1', ['a-1', 'a-1-2'])).toBe('a-1-3');
    expect(uniqueId('Łańcuszek ż', [])).toBe('lancuszek-z');
    expect(uniqueId('***', [], 'chart')).toBe('chart');
  });
});

describe('building a pattern from scratch', () => {
  it('produces a valid pattern that resolves', () => {
    let p = blank();
    expect(patternSchema.safeParse(p).success).toBe(true);
    expect(validatePattern(p).diagnostics.map((d) => d.code)).toContain('empty-layout');

    const a = addChart(p, 'A.1', 4, 2);
    p = a.pattern;
    const b = addChart(p, 'A.1', 2, 2);
    p = b.pattern;
    expect([a.chartId, b.chartId]).toEqual(['a-1', 'a-1-2']);

    const stage = p.stages[0];
    if (!stage) throw new Error('no stage');
    const chartA = p.charts[0];
    if (!chartA) throw new Error('no chart');
    const seg1 = newChartSegment(stage, chartA);
    const withSeg = { ...stage, layout: [...stage.layout, seg1] };
    const seg2 = newChartSegment(withSeg, chartA);
    expect([seg1.placementId, seg2.placementId]).toEqual(['a-1-1', 'a-1-2']);
    const marker = newMarker(withSeg, 'Tył');
    p = updateStage(p, {
      ...stage,
      layout: [...stage.layout, seg1, marker, { ...seg2, stitches: [6, 8] }],
      expectedStitches: [10, 12],
    });
    const report = validatePattern(p);
    expect(report.diagnostics).toEqual([]);
    expect(resolveStage(p, 'stage-1', 1).stitchCount).toBe(12);
    expect(chartUsage(p).get('a-1')).toBe(2);
    expect(chartUsage(p).get('a-1-2')).toBe(0);
  });

  it('removing a chart removes its placements but keeps the stage valid', () => {
    const p = removeChart(fixturePattern, 'seed');
    expect(p.charts.some((c) => c.id === 'seed')).toBe(false);
    expect(
      p.stages.every((s) => s.layout.every((x) => x.kind !== 'chart' || x.chartId !== 'seed')),
    ).toBe(true);
    const only = removeChart(addChart(blank(), 'X', 1, 1).pattern, 'x');
    expect(only.stages[0]?.layout).toEqual([{ kind: 'marker', id: 'start' }]);
  });

  it('duplicates and updates charts', () => {
    const d = duplicateChart(fixturePattern, 'rope', 'R kopia');
    expect(d.chartId).toBe('r-kopia');
    expect(d.pattern.charts.at(-1)?.rows).toEqual(rope.rows);
    expect(duplicateChart(fixturePattern, 'none', 'x').pattern).toBe(fixturePattern);
    const u = updateChart(fixturePattern, { ...rope, name: 'Nowa' });
    expect(u.charts.find((c) => c.id === 'rope')?.name).toBe('Nowa');
  });
});

describe('sizes', () => {
  const withLists = (): Pattern => {
    const p = addChart(blank(), 'A', 2, 2).pattern;
    const stage = p.stages[0];
    if (!stage) throw new Error('no stage');
    return updateStage(p, {
      ...stage,
      rows: [10, 20],
      expectedStitches: [2, 4],
      layout: [{ kind: 'chart', placementId: 'x', chartId: 'a', stitches: [2, 4] }],
    });
  };

  it('reads and writes per-size values', () => {
    expect(sizeValueAt(undefined, 0)).toBeUndefined();
    expect(sizeValueAt(5, 3)).toBe(5);
    expect(sizeValueAt([1, 2], 5)).toBeUndefined();
    expect(setSizeValue(5, 1, 7, 3)).toEqual([5, 7, 5]);
    expect(setSizeValue(undefined, 0, 7, 2)).toEqual([7, 7]);
    expect(isUniform([3, 3])).toBe(true);
    expect(isUniform([3, 4])).toBe(false);
  });

  it('adding a size copies values, removing it drops them', () => {
    const p = addSize(withLists(), 'L');
    expect(p.sizes).toEqual(['S', 'M', 'L']);
    expect(p.stages[0]?.rows).toEqual([10, 20, 20]);
    expect(p.stages[0]?.expectedStitches).toEqual([2, 4, 4]);
    const seg = p.stages[0]?.layout[0];
    expect(seg?.kind === 'chart' && seg.stitches).toEqual([2, 4, 4]);
    const q = removeSize(p, 0);
    expect(q.sizes).toEqual(['M', 'L']);
    expect(q.stages[0]?.rows).toEqual([20, 20]);
    expect(
      removeSize(blankPattern({ id: 'x', title: 'x', sizes: ['1'], stageName: 's' }), 0).sizes,
    ).toEqual(['1']);
    expect(renameSize(q, 1, 'XL').sizes).toEqual(['M', 'XL']);
    expect(validatePattern(addSize(withLists(), 'L', 0)).ok).toBe(true);
  });
});

describe('stages', () => {
  it('adds and removes stages, keeping at least one', () => {
    const { pattern, stageId } = addStage(blank(), 'Rękaw');
    expect(stageId).toBe('rekaw');
    expect(removeStage(pattern, stageId).stages).toHaveLength(1);
    expect(removeStage(blank(), 'stage-1').stages).toHaveLength(1);
  });

  it('moves items', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });
});

describe('symbols and legend', () => {
  it('lists used symbols', () => {
    expect(usedSymbolIds(fixturePattern)).toContain('cable:2-2-lc');
  });

  it('sets, edits and clears legend entries in place', () => {
    let p = setLegendEntry(blank(), 'std:k', { number: '1', text: ' prawe ' });
    p = setLegendEntry(p, 'std:p', { text: 'lewe' });
    p = setLegendEntry(p, 'std:k', { number: '1' });
    expect(p.legend).toEqual([
      { symbolId: 'std:k', number: '1' },
      { symbolId: 'std:p', text: 'lewe' },
    ]);
    expect(setLegendEntry(p, 'std:p', {}).legend).toHaveLength(1);
  });

  it('adds custom symbols and refuses to remove used ones', () => {
    const base = blank();
    const id = customSymbolId('Bąbel', base);
    expect(id).toBe('user:babel');
    const symbol = {
      id,
      family: 'basic' as const,
      width: 1,
      consumes: 1,
      produces: 1,
      worked: true,
      ws: { mode: 'same' as const },
      glyph: { primitives: [] },
      label: { pl: 'bąbel', en: 'bobble' },
      description: { pl: 'bąbel', en: 'bobble' },
    };
    let p = upsertCustomSymbol(base, symbol);
    p = upsertCustomSymbol(p, { ...symbol, width: 1, label: { pl: 'b', en: 'b' } });
    expect(p.symbols).toHaveLength(1);
    expect(customSymbolId('Bąbel', p)).toBe('user:babel-2');
    const used = updateChart(addChart(p, 'A', 1, 1, id).pattern, {
      id: 'a',
      name: 'A',
      width: 1,
      height: 1,
      palette: { a: id },
      rows: ['a'],
    });
    expect(removeCustomSymbol(used, id)).toBeNull();
    expect(removeCustomSymbol(p, id)?.symbols).toEqual([]);
    // The only problem left is the empty layout: the custom symbol itself is valid.
    expect(validatePattern(used).diagnostics.map((d) => d.code)).toEqual(['empty-layout']);
  });
});

describe('history', () => {
  it('undoes, redoes, bounds and dedupes', () => {
    let h = createHistory(0, 2);
    h = pushHistory(h, 1);
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    expect(h.past).toEqual([1, 2]);
    h = undoHistory(h);
    expect(h.present).toBe(2);
    h = redoHistory(h);
    expect(h.present).toBe(3);
    expect(redoHistory(h)).toBe(h);
    expect(undoHistory(createHistory(1))).toEqual(createHistory(1));
    h = replacePresent(h, 9);
    expect(h).toMatchObject({ present: 9, past: [1, 2] });
  });
});
