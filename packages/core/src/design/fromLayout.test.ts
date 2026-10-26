import { describe, expect, it } from 'vitest';
import { blankPattern, blankProject, insertPattern } from '../authoring/pattern';
import { applySymbolRows, blankChart } from '../chart/edit';
import { resolvePattern } from '../layout/resolve';
import { designSchema, type Chart, type Pattern, type Segment } from '../schema/pattern';
import { createRegistry } from '../symbols/registry';
import { composeDesign } from './compose';
import { designFromLayout, fileMotifId, fileMotifs, plainKnit } from './fromLayout';

const registry = createRegistry();
const K = 'std:k';
const P = 'std:p';

/** A chart from rows written top first, `k`/`p` per stitch, left → right. */
const chart = (id: string, top: string[]): Chart =>
  applySymbolRows(
    blankChart({ id, name: id.toUpperCase() }, 1, 1),
    [...top].reverse().map((r) => Array.from(r).map((c) => (c === 'p' ? P : K))),
  );

const stageOf = (charts: Chart[], layout: Segment[], rows?: number) => {
  const pattern: Pattern = {
    ...blankPattern('body', 'Korpus'),
    charts,
    layout: [{ kind: 'marker', id: 'start' }, ...layout],
    ...(rows ? { rows } : {}),
  };
  const project = insertPattern(
    blankProject({ id: 'p', name: 'Sweter', now: '2026-10-25T12:00:00.000Z' }),
    pattern,
  ).project;
  return resolvePattern(project, 'body', { registry });
};

describe('designs from an imported layout', () => {
  const a = chart('a', ['pkkk', 'kpkk', 'kkpk']);
  const b = chart('b', ['ppk', 'kpp']);

  it('lays each chart section as a tile that works exactly like the layout', () => {
    const stage = stageOf(
      [a, b],
      [
        { kind: 'chart', placementId: 'a-1', chartId: 'a', stitches: 8 },
        { kind: 'chart', placementId: 'b-1', chartId: 'b', stitches: 5 },
        {
          kind: 'chart',
          placementId: 'a-2',
          chartId: 'a',
          stitches: 6,
          startColumn: 2,
          rowOffset: 1,
        },
      ],
    );
    const design = designFromLayout(stage);
    if (!design) throw new Error('no design');
    expect(designSchema.safeParse(design).success).toBe(true);
    expect(design.width).toBe(19);
    // As tall as the tallest chart: one repeat to work on.
    expect(design.height).toBe(3);
    expect(design.placements).toEqual([
      { id: 'p1', motifId: 'pdf:a', col: 1, row: 1, repeatX: 2, repeatY: 'fill' },
      { id: 'p2', motifId: 'pdf:b~b-1', col: 9, row: 1, repeatX: 1, repeatY: 'fill' },
      { id: 'p3', motifId: 'pdf:a~a-2', col: 14, row: 1, repeatX: 1, repeatY: 'fill' },
    ]);

    const rows = composeDesign(design, registry);
    for (let row = 1; row <= design.height; row++) {
      for (let col = 1; col <= design.width; col++) {
        expect(rows[row - 1]?.[col - 1], `row ${row}, col ${col}`).toBe(
          stage.cellAtCol(row, col).symbolId,
        );
      }
    }
  });

  it('is as tall as the tallest chart, and leaves plain knit filler as background', () => {
    const knit = chart('fill', ['k']);
    const stage = stageOf(
      [a, knit, b],
      [
        { kind: 'chart', placementId: 'fill-1', chartId: 'fill', stitches: 3 },
        { kind: 'chart', placementId: 'a-1', chartId: 'a' },
        { kind: 'chart', placementId: 'b-1', chartId: 'b' },
        { kind: 'chart', placementId: 'fill-2', chartId: 'fill', stitches: 2 },
      ],
      40,
    );
    const design = designFromLayout(stage, { background: (c) => c.id === 'fill' && plainKnit(c) });
    expect(design).toMatchObject({ width: 12, height: 3 });
    expect(design?.placements.map((p) => [p.motifId, p.col])).toEqual([
      ['pdf:a', 4],
      ['pdf:b', 8],
    ]);
  });

  it('gives nothing for a layout without charts', () => {
    expect(designFromLayout(stageOf([], []))).toBeNull();
  });

  it('offers the file charts as pieces with their own ids', () => {
    expect(fileMotifs([a, b]).map((m) => m.id)).toEqual([fileMotifId('a'), fileMotifId('b')]);
    expect(fileMotifs([a])[0]?.rows).toEqual(a.rows);
  });
});
