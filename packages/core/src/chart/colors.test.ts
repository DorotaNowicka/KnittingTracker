import { describe, expect, it } from 'vitest';
import { blankPattern, blankProject, insertPattern } from '../authoring/pattern';
import { applyDesign, blankDesign, composeColors } from '../design/compose';
import { rowInstructions } from '../instructions/row';
import { resolvePattern } from '../layout/resolve';
import { patternSchema, projectSchema, type Chart, type Design } from '../schema/pattern';
import { createRegistry } from '../symbols/registry';
import { blankChart } from './edit';
import { parseChart } from './parse';
import { chartColorRows, hasColors, isDark, nextYarn, withColorRows, YARN_COLORS } from './colors';

const registry = createRegistry();
/** Colour rows top first, '-' for none. */
const view = (rows: (string | null)[][]) =>
  [...rows].reverse().map((r) => r.map((y) => y ?? '-').join(''));

/** A 2 × 2 piece: a B dot in its bottom-right cell. */
const dot: Chart = withColorRows(blankChart({ id: 'dot', name: 'Kropka' }, 2, 2), [
  [null, 'B'],
  [null, null],
]);

describe('colourwork', () => {
  it('keeps a colour layer on a chart, and parses each cell with its yarn', () => {
    expect(dot.colors).toEqual(['-B', '--']);
    expect(hasColors(dot)).toBe(true);
    expect(chartColorRows(dot)).toEqual([
      [null, 'B'],
      [null, null],
    ]);
    const parsed = parseChart(dot, registry);
    expect(parsed.cells[0]?.[1]?.yarn).toBe('B');
    // A cell without a colour of its own is in the main yarn, A.
    expect(parsed.cells[0]?.[0]?.yarn).toBe('A');
    expect(
      parseChart(blankChart({ id: 'p', name: 'P' }, 1, 1), registry).cells[0]?.[0]?.yarn,
    ).toBeUndefined();
    // No colour anywhere: no layer.
    expect('colors' in withColorRows(dot, [[null, null]])).toBe(false);
  });

  it('composes colours from pieces, the colour brush and mirrors', () => {
    const design: Design = {
      ...blankDesign(6, 2),
      motifs: [dot],
      placements: [{ id: 'p1', motifId: 'dot', col: 1, row: 1, repeatX: 'fill', repeatY: 1 }],
      colorCells: [{ row: 2, col: 6, yarn: 'C' }],
    };
    expect(view(composeColors(design))).toEqual(['C-----', '-B-B-B']);
    // A mirror at the half copies the right half's colours onto the left, reversed.
    expect(view(composeColors({ ...design, mirrors: [2] }))).toEqual(['------', 'B-BB-B']);
  });

  it("puts the colours into the pattern's chart and the row instructions", () => {
    const design: Design = {
      ...blankDesign(4, 1),
      colorCells: [
        { row: 1, col: 1, yarn: 'A' },
        { row: 1, col: 2, yarn: 'A' },
        { row: 1, col: 3, yarn: 'B' },
      ],
    };
    const pattern = applyDesign({ ...blankPattern('p', 'Karczek'), design }, registry);
    expect(patternSchema.parse(pattern).charts[0]?.colors).toEqual(['-BAA']);
    const project = insertPattern(
      blankProject({ id: 'x', name: 'Sweter', sizes: ['M'], now: '2026-10-28T20:00:00.000Z' }),
      pattern,
    ).project;
    const grid = resolvePattern(project, 'p');
    expect(
      rowInstructions(grid, 1).tokens.map((t) => [t.count, t.symbolId, t.yarn ?? '-']),
    ).toEqual([
      [2, 'std:k', 'A'],
      [1, 'std:k', 'B'],
      [1, 'std:k', 'A'],
    ]);
  });

  it('gives a project its yarns: the next free letter and an unused colour', () => {
    const first = nextYarn([], (l) => `Kolor ${l}`);
    expect(first).toEqual({ id: 'A', name: 'Kolor A', color: YARN_COLORS[0] });
    const second = nextYarn(first ? [first] : [], (l) => `Kolor ${l}`);
    expect(second?.id).toBe('B');
    expect(second?.color).toBe(YARN_COLORS[1]);
    const project = {
      ...blankProject({ id: 'y', name: 'Sweter', sizes: ['M'], now: '2026-10-28T20:00:00.000Z' }),
      yarns: [first, second],
    };
    expect(projectSchema.parse(project).yarns).toHaveLength(2);
    expect(isDark('#2b3a55')).toBe(true);
    expect(isDark('#f2ead8')).toBe(false);
  });
});
