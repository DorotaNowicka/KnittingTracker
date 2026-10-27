import { describe, expect, it } from 'vitest';
import { blankPattern, blankProject, insertPattern } from '../authoring/pattern';
import { chartToSymbolRows } from '../chart/edit';
import { resolvePattern } from '../layout/resolve';
import { designSchema, type Design, type ShapingRule } from '../schema/pattern';
import { createRegistry } from '../symbols/registry';
import { validateProject } from '../validate/pattern';
import { applyDesign, blankDesign, designChart } from './compose';
import { MOTIF_LIBRARY } from './motifs';
import {
  boundOffAbove,
  fixBalance,
  shapeRows,
  startStitches,
  stitchBalance,
  stitchesPerRow,
  withShaping,
} from './shaping';

const registry = createRegistry();
const lib = (id: string) => {
  const m = MOTIF_LIBRARY.find((x) => x.chart.id === `lib:${id}`);
  if (!m) throw new Error(id);
  return m.chart;
};
const short: Record<string, string> = {
  'std:k': 'k',
  'std:p': 'p',
  'std:none': '·',
  'std:m1l': 'L',
  'std:m1r': 'R',
  'std:ssk': '\\',
  'std:k2tog': '/',
};
/** A row of the grid as it is drawn (RS view), shortened. */
const line = (row: readonly string[] | undefined) =>
  (row ?? []).map((id) => short[id] ?? id).join('');

const rule = (over: Partial<ShapingRule>): ShapingRule => ({
  id: 'a',
  kind: 'decrease',
  where: 'edges',
  start: 1,
  every: 1,
  times: 1,
  inset: 1,
  right: 'std:ssk',
  left: 'std:k2tog',
  ...over,
});

describe('shaping in the pattern creator', () => {
  it('a sleeve from the cuff: the grid grows by the increases, 20 stitches to start', () => {
    const sleeve = withShaping(blankDesign(20, 14), [
      rule({ kind: 'increase', start: 7, every: 6, times: 2, right: 'std:m1l', left: 'std:m1r' }),
    ]);
    expect(designSchema.safeParse(sleeve).success).toBe(true);
    expect(sleeve.width).toBe(24);
    expect(startStitches(sleeve)).toBe(20);
    expect(stitchesPerRow(sleeve)).toEqual([
      20, 20, 20, 20, 20, 20, 22, 22, 22, 22, 22, 22, 24, 24,
    ]);
    const rows = shapeRows(
      Array.from({ length: 14 }, () => Array<string>(24).fill('std:k')),
      sleeve,
      registry,
    );
    expect(line(rows[0])).toBe('··' + 'k'.repeat(20) + '··');
    // One edge stitch, then the new stitch: M1R at the left end, M1L at the right.
    expect(line(rows[6])).toBe('·kR' + 'k'.repeat(18) + 'Lk·');
    expect(line(rows[7])).toBe('·' + 'k'.repeat(22) + '·');
    expect(line(rows[12])).toBe('kR' + 'k'.repeat(20) + 'Lk');
    // Without the rule the spare columns go again.
    expect(withShaping(sleeve, [])).toEqual(blankDesign(20, 14));
  });

  it('a body in the round: decreases at both side lines, inside the grid', () => {
    const body: Design = withShaping({ ...blankDesign(40, 8), halves: ['Przód', 'Tył'] }, [
      rule({ where: 'sides', start: 3, every: 4, times: 2 }),
    ]);
    expect(body.width).toBe(40);
    expect(stitchesPerRow(body)).toEqual([40, 40, 36, 36, 36, 36, 32, 32]);
    const rows = chartToSymbolRows(designChart(body, registry, 'Korpus'));
    // Back (left half) | front (right half): ssk after each side line, k2tog before it.
    expect(line(rows[2])).toBe('·k/' + 'k'.repeat(14) + '\\k··k/' + 'k'.repeat(14) + '\\k·');
    expect(line(rows[6])).toBe('··k/' + 'k'.repeat(12) + '\\k····k/' + 'k'.repeat(12) + '\\k··');

    const pattern = applyDesign({ ...blankPattern('body', 'Korpus'), design: body }, registry);
    expect(pattern.charts.map((c) => c.width)).toEqual([20, 20]);
    const project = insertPattern(
      blankProject({ id: 'p', name: 'Sweter', now: '2026-10-27T12:00:00.000Z' }),
      pattern,
    ).project;
    expect(validateProject(project).ok).toBe(true);
    const grid = resolvePattern(project, 'body', { registry });
    expect(grid.cellAtCol(3, 40).symbolId).toBe('std:none');
    expect(grid.cellAtCol(3, 38).symbolId).toBe('std:ssk');
  });

  it('keeps the tiles in their places in the pattern when spare columns are added', () => {
    const drawn: Design = {
      ...blankDesign(20, 10),
      motifs: [lib('rib-1-1'), lib('cable-2-2-left')],
      placements: [
        { id: 'rib', motifId: 'lib:rib-1-1', col: 1, row: 1, repeatX: 'fill', repeatY: 'fill' },
        { id: 'c', motifId: 'lib:cable-2-2-left', col: 8, row: 1, repeatX: 1, repeatY: 'fill' },
      ],
      cells: [{ row: 2, col: 5, symbolId: 'std:p' }],
    };
    const once = withShaping(drawn, [
      rule({ kind: 'increase', start: 5, right: 'std:m1l', left: 'std:m1r' }),
    ]);
    expect(once.width).toBe(22);
    // One spare column on the right: the cable moves with the stitches, the rib keeps its rhythm.
    expect(once.placements.map((p) => [p.id, p.col])).toEqual([
      ['rib', 2],
      ['c', 9],
    ]);
    expect(once.cells).toEqual([{ row: 2, col: 6, symbolId: 'std:p' }]);
    // Row 1, the 20 stitches cast on: the same pattern as before, between "no stitch".
    const before = chartToSymbolRows(designChart(drawn, registry, 'x'))[0] ?? [];
    const after = chartToSymbolRows(designChart(once, registry, 'x'))[0] ?? [];
    expect(after.slice(1, 21)).toEqual(before);
    expect([after[0], after[21]]).toEqual(['std:none', 'std:none']);
  });

  it('a stitch bound off is gone above: "no stitch" in its column up to the top', () => {
    const neck: Design = {
      ...blankDesign(8, 4),
      cells: [
        { row: 2, col: 4, symbolId: 'std:bo' },
        { row: 2, col: 5, symbolId: 'std:bo' },
      ],
    };
    const rows = chartToSymbolRows(designChart(neck, registry, 'x'));
    expect(rows.map(line).reverse()).toEqual(
      ['kkk··kkk', 'kkk··kkk', 'kkk••kkk', 'kkkkkkkk'].map((x) => x.replace(/•/g, 'std:bo')),
    );
    expect(stitchBalance(rows, registry)).toEqual([]);
    expect(
      boundOffAbove([
        ['std:bo', 'std:k'],
        ['std:k', 'std:k'],
      ]),
    ).toEqual([
      ['std:bo', 'std:k'],
      ['std:none', 'std:k'],
    ]);
  });

  it('finds rows that do not add up and puts the missing "no stitch" next to the brush symbol', () => {
    // Lace adds up: a yarn over for the decrease.
    const lace: Design = {
      ...blankDesign(6, 3),
      cells: [
        { row: 2, col: 3, symbolId: 'std:yo' },
        { row: 2, col: 4, symbolId: 'std:k2tog' },
      ],
    };
    expect(stitchBalance(chartToSymbolRows(designChart(lace, registry, 'x')), registry)).toEqual(
      [],
    );

    // One k2tog alone in row 2: it takes 7 stitches of the 6 left below.
    const alone: Design = {
      ...blankDesign(6, 3),
      cells: [{ row: 2, col: 4, symbolId: 'std:k2tog' }],
    };
    const rows = chartToSymbolRows(designChart(alone, registry, 'x'));
    const problems = stitchBalance(rows, registry);
    expect(problems).toEqual([{ row: 2, diff: 1 }]);
    const fixed = fixBalance(alone, rows, registry, problems[0] ?? { row: 0, diff: 0 });
    const after = chartToSymbolRows(designChart(fixed, registry, 'x'));
    // k2tog leans right: the stitch on its left goes, from row 2 up.
    expect(after.map(line).reverse()).toEqual(['k·kkkk', 'k·/kkk', 'kkkkkk']);
    expect(stitchBalance(after, registry)).toEqual([]);

    // A make one alone in row 3: "no stitch" below it.
    const more: Design = { ...blankDesign(5, 3), cells: [{ row: 3, col: 2, symbolId: 'std:m1l' }] };
    const r2 = chartToSymbolRows(designChart(more, registry, 'x'));
    const p2 = stitchBalance(r2, registry);
    expect(p2).toEqual([{ row: 3, diff: -1 }]);
    const after2 = chartToSymbolRows(
      designChart(fixBalance(more, r2, registry, p2[0] ?? { row: 0, diff: 0 }), registry, 'x'),
    );
    expect(after2.map(line).reverse()).toEqual(['kkkLk', 'kkk·k', 'kkk·k']);
    expect(stitchBalance(after2, registry)).toEqual([]);
  });
});
