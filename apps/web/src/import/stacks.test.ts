import { projectSchema, rowNotesAt, validateProject } from '@kt/core';
import { partSteps, planCharts } from '@kt/importer';
import { describe, expect, it } from 'vitest';
import { buildProjectFromElements, initialElements, type Elements } from './elements';
import { arrowMessage, importStacks } from './stacks';

/** A chart of `widths` (bottom first, rows each), right-aligned. */
const stepped = (widths: readonly (readonly [number, number])[], cols: number) =>
  widths.flatMap(([w, rows]) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) =>
        c < cols - w ? 'std:none' : r % 2 === c % 2 ? 'std:k' : 'std:p',
      ),
    ),
  );

const TEXT = `KARCZEK:
Przerabiać schemat A.1 na okrągło. W okrążeniach oznaczonych strzałką w schematach A.1 dodawać oczka:
Strzałka-1: równomiernie dodać 36-38 oczek = 156-162 oczka (26-27 motywów po 6 oczek).
Strzałka-2: równomiernie dodać 64-58 oczek = 220-220 oczek (11-11 motywów po 20 oczek).
KORPUS:
= 192-208 oczek.
Przerabiać schemat A.3 na okrągło – w pierwszym okrążeniu dodać 0-2 oczka = 192-210 oczek (wg schematu A.3 po 6 oczek).
Powtarzać schemat A.3 na wysokość, aż długość robótki wynosi ok. 27-28 cm.
Przerabiać schemat A.4 na okrągło = 192-208 oczek (wg schematu A.4 po 4 oczka).
`;
const SIZES = ['S', 'M'];

const charts = [
  {
    name: 'Schemat 1',
    rows: stepped(
      [
        [4, 3],
        [6, 4],
        [20, 5],
      ],
      20,
    ),
  },
  { name: 'Schemat 2', rows: stepped([[6, 8]], 6) },
  { name: 'Schemat 3', rows: stepped([[4, 6]], 4) },
];
const arrows = [[3, 7], undefined, undefined];

function setup(size = 1) {
  const plan = planCharts(
    charts.map((c, i) => ({ rows: c.rows, ...(arrows[i] ? { arrows: arrows[i] } : {}) })),
    TEXT,
    SIZES,
  );
  const elements: Elements = { ...initialElements('sweater', 3) };
  const yoke = elements['yoke'];
  const withYoke: Elements = yoke ? { ...elements, yoke: { ...yoke, include: true } } : elements;
  const { stacks, taken } = importStacks({
    plan,
    charts,
    arrows,
    steps: partSteps(TEXT, 'sweater', SIZES.length),
    kind: 'sweater',
    elements: withYoke,
    size,
    lang: 'pl',
  });
  return { plan, stacks, taken, elements: withYoke };
}

describe('parts worked as a stack of charts', () => {
  it('turns a yoke into its bands and a body into its charts one after another', () => {
    const { stacks, taken } = setup();
    expect(
      stacks['yoke']?.map((e) => [e.id, e.title, e.stitches, e.perSize, e.rows, e.notes?.[0]]),
    ).toEqual([
      [
        'yoke-1',
        'A.1',
        124,
        [120, 124],
        3,
        { rows: [3], message: 'Strzałka 1: równomiernie dodaj 38 oczek – będzie 162 oczka.' },
      ],
      [
        'yoke-2',
        'A.1',
        162,
        [156, 162],
        4,
        { rows: [4], message: 'Strzałka 2: równomiernie dodaj 58 oczek – będzie 220 oczek.' },
      ],
      ['yoke-3', 'A.1', 220, [220, 220], 5, undefined],
    ]);
    expect(stacks['body']?.map((e) => [e.title, e.stitches, e.rows, e.cm])).toEqual([
      ['A.3', 210, undefined, 28],
      ['A.4', 208, 6, undefined],
    ]);
    // These charts are no plain part's.
    expect(taken).toEqual([0, 1, 2]);
  });

  it('builds one pattern per entry, grouped under the part, with the arrow rounds marked', () => {
    const { stacks, taken, elements } = setup();
    const project = buildProjectFromElements({
      id: 'p',
      name: 'Karczek',
      kind: 'sweater',
      sizes: SIZES,
      now: '2026-10-30T10:00:00.000Z',
      lang: 'pl',
      charts,
      legend: [],
      layout: { sequence: [], sectionNames: ['Przód', 'Tył'] },
      elements,
      order: ['neck', 'yoke', 'body', 'bottom-rib', 'sleeve', 'sleeve-cuff'],
      stacks,
      taken,
    });
    expect(projectSchema.safeParse(project).success).toBe(true);
    const own = project.patterns.filter((p) => p.group);
    expect(own.map((p) => [p.id, p.name, p.group, p.rows, p.targetCm, p.expectedStitches])).toEqual(
      [
        ['yoke-1', 'Karczek 1 · A.1', 'Karczek', 3, undefined, [120, 124]],
        ['yoke-2', 'Karczek 2 · A.1', 'Karczek', 4, undefined, [156, 162]],
        ['yoke-3', 'Karczek 3 · A.1', 'Karczek', 5, undefined, 220],
        ['body-1', 'Korpus 1 · A.3', 'Korpus', undefined, [27, 28], [192, 210]],
        ['body-2', 'Korpus 2 · A.4', 'Korpus', 6, undefined, [192, 208]],
      ],
    );
    // A band is its chart's rows, cut out: 4 stitches repeated round the yoke.
    const first = own[0];
    expect(first?.charts.map((c) => [c.name, c.width, c.height])).toEqual([['A.1 rz. 1–3', 4, 3]]);
    expect(first && rowNotesAt(first, 3).map((n) => n.message)).toEqual([
      'Strzałka 1: równomiernie dodaj 38 oczek – będzie 162 oczka.',
    ]);
    expect(validateProject(project).ok).toBe(true);
  });

  it('takes the knitter’s stitches for a band, for every size', () => {
    const { stacks, taken, elements } = setup();
    const project = buildProjectFromElements({
      id: 'p',
      name: 'K',
      kind: 'sweater',
      sizes: SIZES,
      now: '2026-10-30T10:00:00.000Z',
      lang: 'pl',
      charts,
      legend: [],
      layout: { sequence: [], sectionNames: ['Przód', 'Tył'] },
      elements,
      stacks,
      taken,
      setups: { 'yoke-1': { sequence: [], stitches: 128 } },
    });
    expect(project.patterns.find((p) => p.id === 'yoke-1')?.expectedStitches).toBe(128);
  });

  it('words the arrow’s round', () => {
    expect(arrowMessage({ n: 3, added: -2, total: 192 }, 'pl')).toBe(
      'Strzałka 3: równomiernie zamknij 2 oczka – będzie 192 oczka.',
    );
    expect(arrowMessage({ n: 1, added: 22, total: 156 }, 'en')).toBe(
      'Arrow 1: increase 22 stitches evenly — 156 stitches after it.',
    );
    expect(arrowMessage({ n: 2, added: null, total: 300 }, 'pl')).toBe(
      'Strzałka 2: równomiernie zmień liczbę oczek, jak podaje opis – 300 oczek.',
    );
  });
});
