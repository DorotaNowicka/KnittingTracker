import { createRegistry, projectSchema, validateProject } from '@kt/core';
import { describe, expect, it } from 'vitest';
import {
  buildProjectFromElements,
  initialElements,
  kindItems,
  orderedItems,
  partsOf,
  withDesignFromLayout,
  type BuildInput,
} from './elements';

const rows = (w: number, h: number, id = 'std:k') =>
  Array.from({ length: h }, () => Array<string>(w).fill(id));

const base = (over: Partial<BuildInput> = {}): BuildInput => ({
  id: 'p1',
  name: 'Sweter',
  kind: 'sweater',
  sizes: ['S', 'M'],
  now: '2026-10-22T20:00:00.000Z',
  lang: 'pl',
  charts: [
    { name: 'A.1', rows: rows(2, 2) },
    { name: 'A.2', rows: rows(4, 2, 'std:p') },
  ],
  legend: [{ symbolId: 'std:p', text: 'lewe' }],
  layout: {
    sequence: [{ chart: 'A.1', stitches: [10, 12] }, { chart: 'A.2' }],
    stitchCount: [14, 16],
    sectionNames: ['Przód', 'Tył'],
  },
  elements: initialElements('sweater', 2),
  ...over,
});

describe('garment elements', () => {
  it('start with the usual parts, first options and every chart in the main element', () => {
    const e = initialElements('sweater', 2);
    expect(e['body']).toEqual({ include: true, option: 'round', charts: [0, 1] });
    expect(e['yoke']).toMatchObject({ include: false, charts: [] });
    expect(e['sleeve']).toMatchObject({ include: true, charts: [] });
    expect(Object.keys(initialElements('custom', 1))).toEqual(['main']);
    expect(initialElements('custom', 1)['main']?.charts).toEqual([0]);
  });

  it('expand a choice to the parts of the chosen option', () => {
    const body = kindItems('cardigan').find((i) => i.id === 'body');
    if (!body) throw new Error('no body');
    expect(partsOf(body, undefined).map((p) => p.id)).toEqual(['body']);
    expect(partsOf(body, { include: true, option: 'pieces', charts: [] }).map((p) => p.id)).toEqual(
      ['back', 'left-front', 'right-front'],
    );
  });

  it('build one pattern per included part, the main one laid out from the description', () => {
    const project = buildProjectFromElements(base());
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(project).toMatchObject({ kind: 'sweater', sizes: ['S', 'M'], activePatternId: 'body' });
    expect(project.patterns.map((p) => [p.id, p.name, p.tracking ?? 'stitches'])).toEqual([
      ['bottom-rib', 'Ściągacz dołu', 'rows'],
      ['body', 'Korpus', 'stitches'],
      ['sleeve', 'Rękaw', 'rows'],
      ['sleeve-cuff', 'Ściągacz rękawa', 'rows'],
      ['neck', 'Dekolt / golf', 'rows'],
    ]);
    const body = project.patterns[1];
    expect(body?.expectedStitches).toEqual([14, 16]);
    expect(body?.layout.filter((s) => s.kind === 'chart')).toHaveLength(2);
    expect(body?.legend).toEqual([{ symbolId: 'std:p', text: 'lewe' }]);
    // Row counters need no layout, so the whole project is valid from the start.
    expect(validateProject(project).ok).toBe(true);
  });

  it('give charts to other parts, skip parts and split the body into pieces', () => {
    const e = base().elements;
    const project = buildProjectFromElements(
      base({
        elements: {
          ...e,
          body: { include: true, option: 'pieces', charts: [1] },
          sleeve: { include: true, option: null, charts: [0] },
          neck: { include: false, option: null, charts: [] },
          yoke: { include: true, option: null, charts: [] },
        },
      }),
    );
    expect(project.patterns.map((p) => p.id)).toEqual([
      'bottom-rib',
      'back',
      'front',
      'yoke',
      'sleeve',
      'sleeve-cuff',
    ]);
    expect(project.activePatternId).toBe('back');
    // Pieces don't follow the round's description: each places its charts once.
    const back = project.patterns.find((p) => p.id === 'back');
    expect(back?.charts.map((c) => c.name)).toEqual(['A.2']);
    expect(back?.expectedStitches).toBeUndefined();
    const sleeve = project.patterns.find((p) => p.id === 'sleeve');
    expect(sleeve?.layout.filter((s) => s.kind === 'chart').map((s) => s.kind)).toEqual(['chart']);
    expect(sleeve?.tracking).toBeUndefined();
  });

  it('names patterns in the UI language and handles an own project', () => {
    const en = buildProjectFromElements(base({ lang: 'en' }));
    expect(en.patterns[0]?.name).toBe('Bottom ribbing');
    const own = buildProjectFromElements(
      base({ kind: 'custom', elements: initialElements('custom', 2) }),
    );
    expect(own.patterns.map((p) => p.name)).toEqual(['Wzór']);
    expect(own.activePatternId).toBe('main');
  });

  it('creates the patterns in the knitting order of the description', () => {
    const project = buildProjectFromElements(
      base({ order: ['neck', 'yoke', 'body', 'bottom-rib', 'sleeve', 'sleeve-cuff'] }),
    );
    expect(project.patterns.map((p) => p.id)).toEqual([
      'neck',
      'body',
      'bottom-rib',
      'sleeve',
      'sleeve-cuff',
    ]);
    expect(orderedItems('socks', ['toe', 'nope']).map((i) => i.id)).toEqual([
      'toe',
      'cuff',
      'leg',
      'heel',
      'gusset',
      'foot',
    ]);
  });

  it('keep every chart of the file for the creator, and lay a part out as tiles', () => {
    const project = buildProjectFromElements(base());
    const body = project.patterns.find((p) => p.id === 'body');
    expect(project.motifs?.map((m) => [m.id, m.name])).toEqual(
      body?.charts.map((c) => [`pdf:${c.id}`, c.name]),
    );

    // Size S: 10 stitches of A.1 (2 wide) and A.2 (4 wide) once, 14 in all.
    const designed = withDesignFromLayout(project, 'body', createRegistry());
    const pattern = designed.patterns.find((p) => p.id === 'body');
    expect(pattern?.design).toMatchObject({ width: 14, height: 2 });
    expect(
      pattern?.design?.placements.map((p) => [p.motifId, p.col, p.row, p.repeatX, p.repeatY]),
    ).toEqual([
      [`pdf:${body?.charts[0]?.id}`, 1, 1, 5, 'fill'],
      [`pdf:${body?.charts[1]?.id}`, 11, 1, 1, 'fill'],
    ]);
    expect(pattern?.charts.map((c) => c.id)).toEqual(['design']);
    expect(projectSchema.safeParse(designed).success).toBe(true);
    expect(validateProject(designed).ok).toBe(true);
    // A part without charts is left to the creator's grid size step.
    expect(withDesignFromLayout(project, 'sleeve', createRegistry())).toBe(project);
  });
});
