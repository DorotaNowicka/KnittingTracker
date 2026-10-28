import { describe, expect, it } from 'vitest';
import { makeProject, rope, roundPattern } from '../__tests__/fixtures';
import { createHistory, pushHistory, redoHistory, replacePresent, undoHistory } from '../history';
import { resolvePattern } from '../layout/resolve';
import { patternSchema, projectSchema, type Pattern, type Project } from '../schema/pattern';
import { validatePattern, validateProject } from '../validate/pattern';
import {
  addChart,
  addPattern,
  addSize,
  blankPattern,
  blankProject,
  chartUsage,
  collapseSizes,
  customSymbolId,
  duplicateChart,
  duplicatePattern,
  insertPattern,
  isUniform,
  mapPattern,
  moveItem,
  newChartSegment,
  newMarker,
  patternForProject,
  removeChart,
  removeCustomSymbol,
  removePattern,
  removeSize,
  renameSize,
  legendLabel,
  setLegendEntry,
  setSizeValue,
  sizeValueAt,
  uniqueId,
  updateChart,
  updatePattern,
  upsertCustomSymbol,
  usedSymbolIds,
} from './pattern';

const NOW = '2026-10-22T10:00:00.000Z';
const fixture = makeProject();
const blank = () => blankPattern('p', 'Korpus');
const blankWithSizes = (): Project =>
  blankProject({ id: 'proj', name: 'Test', sizes: ['S', 'M'], patternName: 'Korpus', now: NOW });

describe('ids', () => {
  it('derives readable unique ids', () => {
    expect(uniqueId('A.1', [])).toBe('a-1');
    expect(uniqueId('A.1', ['a-1', 'a-1-2'])).toBe('a-1-3');
    expect(uniqueId('Łańcuszek ż', [])).toBe('lancuszek-z');
    expect(uniqueId('***', [], 'chart')).toBe('chart');
  });
});

describe('building a project from scratch', () => {
  it('produces a valid project whose pattern resolves', () => {
    let project = blankWithSizes();
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(project.activePatternId).toBe('pattern-1');
    expect(validatePattern(project, 'pattern-1').diagnostics.map((d) => d.code)).toContain(
      'empty-layout',
    );

    let p = project.patterns[0];
    if (!p) throw new Error('no pattern');
    const a = addChart(p, 'A.1', 4, 2);
    p = a.pattern;
    const b = addChart(p, 'A.1', 2, 2);
    p = b.pattern;
    expect([a.chartId, b.chartId]).toEqual(['a-1', 'a-1-2']);
    expect(patternSchema.safeParse(p).success).toBe(true);

    const chartA = p.charts[0];
    if (!chartA) throw new Error('no chart');
    const seg1 = newChartSegment(p, chartA);
    const withSeg = { ...p, layout: [...p.layout, seg1] };
    const seg2 = newChartSegment(withSeg, chartA);
    expect([seg1.placementId, seg2.placementId]).toEqual(['a-1-1', 'a-1-2']);
    const marker = newMarker(withSeg, 'Tył');
    project = updatePattern(project, {
      ...p,
      layout: [...p.layout, seg1, marker, { ...seg2, stitches: [6, 8] }],
      expectedStitches: [10, 12],
    });
    const report = validateProject(project);
    expect(report.diagnostics).toEqual([]);
    expect(report.patterns['pattern-1']?.ok).toBe(true);
    expect(resolvePattern(project, 'pattern-1', { sizeIndex: 1 }).stitchCount).toBe(12);
    const built = project.patterns[0];
    if (!built) throw new Error('no pattern');
    expect(chartUsage(built).get('a-1')).toBe(2);
    expect(chartUsage(built).get('a-1-2')).toBe(0);
  });

  it('starts a project without patterns when no name is given', () => {
    const empty = blankProject({ id: 'e', name: 'Pusty', now: NOW });
    expect(empty.patterns).toEqual([]);
    expect(empty.activePatternId).toBeUndefined();
    expect(empty.sizes).toEqual(['1']);
    expect(projectSchema.safeParse(empty).success).toBe(true);
    expect(validateProject(empty).ok).toBe(true);
  });

  it('removing a chart removes its placements and changes but keeps the layout valid', () => {
    const changed: Pattern = {
      ...roundPattern,
      modifications: [{ kind: 'replaceChart', chartId: 'seed', chart: rope }],
    };
    const p = removeChart(changed, 'seed');
    expect(p.charts.some((c) => c.id === 'seed')).toBe(false);
    expect(p.layout.every((x) => x.kind !== 'chart' || x.chartId !== 'seed')).toBe(true);
    expect(p.modifications).toBeUndefined();
    const only = removeChart(addChart(blank(), 'X', 1, 1).pattern, 'x');
    expect(only.layout).toEqual([{ kind: 'marker', id: 'start' }]);
  });

  it('duplicates and updates charts', () => {
    const d = duplicateChart(roundPattern, 'rope', 'R kopia');
    expect(d.chartId).toBe('r-kopia');
    expect(d.pattern.charts.at(-1)?.rows).toEqual(rope.rows);
    expect(duplicateChart(roundPattern, 'none', 'x').pattern).toBe(roundPattern);
    const u = updateChart(roundPattern, { ...rope, name: 'Nowa' });
    expect(u.charts.find((c) => c.id === 'rope')?.name).toBe('Nowa');
  });
});

describe('sizes', () => {
  const withLists = (): Project => {
    const project = blankWithSizes();
    return mapPattern(project, 'pattern-1', (p) => ({
      ...addChart(p, 'A', 2, 2).pattern,
      rows: [10, 20],
      expectedStitches: [2, 4],
      targetCm: [30, 32.5],
      layout: [{ kind: 'chart', placementId: 'x', chartId: 'a', stitches: [2, 4] }],
    }));
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

  it('adding a size copies values in every pattern, removing it drops them', () => {
    const p = addSize({ ...withLists(), sizeIndex: 1 }, 'L', 0);
    expect(p.sizes).toEqual(['S', 'L', 'M']);
    expect(p.sizeIndex).toBe(2);
    expect(p.patterns[0]?.rows).toEqual([10, 10, 20]);
    const q0 = addSize(withLists(), 'L');
    expect(q0.patterns[0]?.expectedStitches).toEqual([2, 4, 4]);
    expect(q0.patterns[0]?.targetCm).toEqual([30, 32.5, 32.5]);
    const seg = q0.patterns[0]?.layout[0];
    expect(seg?.kind === 'chart' && seg.stitches).toEqual([2, 4, 4]);
    const q = removeSize({ ...q0, sizeIndex: 2 }, 0);
    expect(q.sizes).toEqual(['M', 'L']);
    expect(q.sizeIndex).toBe(1);
    expect(q.patterns[0]?.rows).toEqual([20, 20]);
    expect(q.patterns[0]?.targetCm).toEqual([32.5, 32.5]);
    expect(removeSize(blankProject({ id: 'x', name: 'x', now: NOW }), 0).sizes).toEqual(['1']);
    expect(renameSize(q, 1, 'XL').sizes).toEqual(['M', 'XL']);
    expect(validateProject(addSize(withLists(), 'L', 0)).ok).toBe(true);
  });

  it('collapses per-size values to one size', () => {
    const p = withLists().patterns[0];
    if (!p) throw new Error('no pattern');
    const c = collapseSizes(p, 1);
    expect(c.rows).toEqual([20, 20]);
    expect(c.targetCm).toEqual([32.5, 32.5]);
  });
});

describe('patterns of a project', () => {
  it('adds, duplicates and removes patterns', () => {
    const { project, patternId } = addPattern(blankWithSizes(), 'Rękaw');
    expect(patternId).toBe('rekaw');
    expect(project.patterns.map((p) => p.id)).toEqual(['pattern-1', 'rekaw']);
    const again = addPattern(project, 'Rękaw');
    expect(again.patternId).toBe('rekaw-2');
    const dup = duplicatePattern(project, 'pattern-1', 'Korpus 2');
    expect(dup.project.patterns.map((p) => p.id)).toEqual(['pattern-1', 'korpus-2', 'rekaw']);
    expect(dup.project.patterns[1]?.name).toBe('Korpus 2');
    const removed = removePattern(project, 'pattern-1');
    expect(removed.patterns.map((p) => p.id)).toEqual(['rekaw']);
    expect(removed.activePatternId).toBe('rekaw');
    const none = removePattern(removed, 'rekaw');
    expect(none.patterns).toEqual([]);
    expect(none.activePatternId).toBeUndefined();
  });

  it('makes the first added pattern the active one', () => {
    const empty = blankProject({ id: 'e', name: 'e', now: NOW });
    const { project } = insertPattern(empty, blank());
    expect(project.activePatternId).toBe('p');
    expect(mapPattern(project, 'nope', () => blank())).toBe(project);
  });

  it('prepares a pattern for another project', () => {
    const source = { ...makeProject(), sizeIndex: 1 };
    const body = source.patterns[0];
    if (!body) throw new Error('no pattern');
    const linked: Pattern = {
      ...body,
      layout: body.layout.map((s) =>
        s.kind === 'chart' ? { ...s, continueFrom: { patternId: 'x', placementId: 'y' } } : s,
      ),
    };
    const same = patternForProject(source, linked, { sizes: ['S', 'M'] });
    expect(same.layout.some((s) => s.kind === 'chart' && s.continueFrom)).toBe(false);
    expect(same.expectedStitches).toEqual([26, 30]);
    const other = patternForProject(source, linked, { sizes: ['one'] });
    expect(other.expectedStitches).toEqual([30, 30]);
  });

  it('moves items', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });
});

describe('symbols and legend', () => {
  it('lists used symbols', () => {
    expect(usedSymbolIds(roundPattern)).toContain('cable:2-2-lc');
    expect(fixture.patterns).toHaveLength(2);
  });

  it('sets, edits and clears legend entries in place', () => {
    let p = setLegendEntry(blank(), 'std:k', { number: '1', text: ' prawe ' });
    p = setLegendEntry(p, 'std:p', { text: 'lewe' });
    p = setLegendEntry(p, 'std:k', { text: '' });
    expect(p.legend).toEqual([
      { symbolId: 'std:k', number: '1' },
      { symbolId: 'std:p', text: 'lewe' },
    ]);
    expect(setLegendEntry(p, 'std:p', { text: '' }).legend).toHaveLength(1);
  });

  it('keeps the other fields when only the name changes, and labels by name, text, standard', () => {
    let p = setLegendEntry(blank(), 'std:k', { number: '1', text: 'oczko prawe' });
    p = setLegendEntry(p, 'std:k', { name: '  prawe  ' });
    expect(p.legend).toEqual([
      { symbolId: 'std:k', number: '1', text: 'oczko prawe', name: 'prawe' },
    ]);
    const k = { id: 'std:k', label: { pl: 'Prawe oczko', en: 'Knit' } };
    expect(legendLabel(p, k, 'pl')).toBe('prawe');
    p = setLegendEntry(p, 'std:k', { name: '' });
    expect(legendLabel(p, k, 'pl')).toBe('oczko prawe');
    expect(legendLabel(blank(), k, 'en')).toBe('Knit');
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
    const project = { ...blankWithSizes(), patterns: [used] };
    expect(validatePattern(project, used.id).diagnostics.map((d) => d.code)).toEqual([
      'empty-layout',
    ]);
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
