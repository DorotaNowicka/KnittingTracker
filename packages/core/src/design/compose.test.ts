import { describe, expect, it } from 'vitest';
import { blankProject, insertPattern, blankPattern } from '../authoring/pattern';
import { chartToSymbolRows } from '../chart/edit';
import { resolvePattern } from '../layout/resolve';
import { designSchema, patternSchema, type Design } from '../schema/pattern';
import { createRegistry } from '../symbols/registry';
import { validateProject } from '../validate/pattern';
import { applyDesign, blankDesign, composeDesign, placementArea } from './compose';
import { MOTIF_LIBRARY } from './motifs';

const registry = createRegistry();
const first = (design: Design) => {
  const p = design.placements[0];
  if (!p) throw new Error('no placement');
  return p;
};
const lib = (id: string) => {
  const m = MOTIF_LIBRARY.find((x) => x.chart.id === `lib:${id}`);
  if (!m) throw new Error(id);
  return m.chart;
};
/** Rows top first, symbols shortened: k, p, other ids as they are. */
const view = (rows: string[][]) =>
  [...rows]
    .reverse()
    .map((r) => r.map((id) => (id === 'std:k' ? 'k' : id === 'std:p' ? 'p' : id)).join(' '));

describe('pattern creator designs', () => {
  it('repeats a 2-stitch rib 113 times from the right edge, all the way up', () => {
    const design: Design = {
      ...blankDesign(226, 3),
      motifs: [lib('rib-1-1')],
      placements: [
        { id: 'a', motifId: 'lib:rib-1-1', col: 1, row: 1, repeatX: 113, repeatY: 'fill' },
      ],
    };
    expect(designSchema.safeParse(design).success).toBe(true);
    const rows = composeDesign(design, registry);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === 226)).toBe(true);
    // RS view, left → right: the piece's right edge (purl) sits on stitch 1.
    expect(rows[0]?.slice(-4)).toEqual(['std:k', 'std:p', 'std:k', 'std:p']);
    expect(rows.flat().filter((id) => id === 'std:p')).toHaveLength(113 * 3);
    expect(placementArea(design, first(design), lib('rib-1-1'))).toMatchObject({
      left: 1,
      right: 226,
      timesX: 113,
      timesY: 3,
    });
  });

  it('keeps each piece on its own vertical rhythm, side by side', () => {
    const tall = { ...lib('purl'), id: 'own:tall', height: 5, rows: ['p', 'k', 'k', 'k', 'k'] };
    const design: Design = {
      ...blankDesign(3, 10),
      motifs: [lib('garter'), tall],
      placements: [
        { id: 'a', motifId: 'lib:garter', col: 1, row: 1, repeatX: 1, repeatY: 'fill' },
        { id: 'b', motifId: 'own:tall', col: 2, row: 1, repeatX: 1, repeatY: 2 },
      ],
    };
    expect(view(composeDesign(design, registry))).toEqual([
      'k k p',
      'k k k',
      'k k p',
      'k k k',
      'k p p',
      'k k k',
      'k k p',
      'k k k',
      'k k p',
      'k p k',
    ]);
  });

  it('stops counted repeats at the edge, puts later pieces on top and the brush above all', () => {
    const design: Design = {
      ...blankDesign(5, 2),
      motifs: [lib('rib-2-2'), lib('moss')],
      placements: [
        { id: 'a', motifId: 'lib:rib-2-2', col: 1, row: 1, repeatX: 5, repeatY: 1 },
        { id: 'b', motifId: 'lib:moss', col: 4, row: 2, repeatX: 1, repeatY: 'fill' },
      ],
      cells: [{ row: 2, col: 1, symbolId: 'std:yo' }],
    };
    const area = placementArea(design, first(design), lib('rib-2-2'));
    expect(area).toMatchObject({ left: 1, right: 5, timesX: 1.25, timesY: 1 });
    expect(view(composeDesign(design, registry))).toEqual(['k p k k std:yo', 'p k k p p']);
  });

  it('cuts a cable that does not fit, and makes a valid pattern from the design', () => {
    const design: Design = {
      ...blankDesign(16, 8),
      motifs: [lib('cable-2-2-left'), lib('rib-1-1')],
      placements: [
        { id: 'r', motifId: 'lib:rib-1-1', col: 1, row: 1, repeatX: 'fill', repeatY: 2 },
        {
          id: 'c',
          motifId: 'lib:cable-2-2-left',
          col: 1,
          row: 3,
          repeatX: 'fill',
          repeatY: 'fill',
        },
      ],
    };
    const rows = composeDesign(design, registry);
    // 16 = 2 whole cables + 4 stitches: the cut cable becomes knit.
    expect(rows[4]?.filter((id) => id === 'cable:2-2-lc')).toHaveLength(2);
    const pattern = applyDesign({ ...blankPattern('body', 'Korpus'), design }, registry);
    expect(patternSchema.safeParse(pattern).success).toBe(true);
    expect(pattern.rows).toBe(8);
    expect(chartToSymbolRows(pattern.charts[0] ?? lib('purl'))).toEqual(rows);
    const project = insertPattern(
      blankProject({ id: 'p', name: 'P', sizes: ['M'], now: '2026-10-24T10:00:00.000Z' }),
      pattern,
    ).project;
    expect(resolvePattern(project, 'body').stitchCount).toBe(16);
    expect(validateProject(project).ok).toBe(true);
  });

  it('offers a library of valid pieces', () => {
    for (const m of MOTIF_LIBRARY) {
      const design: Design = {
        ...blankDesign(m.chart.width * 3, m.chart.height * 2),
        motifs: [m.chart],
        placements: [
          { id: 'x', motifId: m.chart.id, col: 1, row: 1, repeatX: 'fill', repeatY: 'fill' },
        ],
      };
      const project = insertPattern(
        blankProject({ id: 'p', name: 'P', sizes: ['M'], now: '2026-10-24T10:00:00.000Z' }),
        applyDesign({ ...blankPattern('x', 'X'), design }, registry),
      ).project;
      expect(validateProject(project).ok, m.chart.id).toBe(true);
    }
  });
});
