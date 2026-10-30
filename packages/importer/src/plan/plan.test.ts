import { describe, expect, it } from 'vitest';
import { compose } from '../__tests__/synth';
import { descriptionBlocks } from '../describe/sections';
import { findArrows } from '../raster/arrows';
import { renderCells } from '../raster/draw';
import { detectGrids } from '../raster/grid';
import { bandRows, chartBands } from './bands';
import { planCharts, planName } from './plan';
import { chainStack, chartForSize, partSteps } from './stack';
import { arrowCharts, chartWidths, textArrows, textSteps } from './text';

const plain = (cols: number, rows: number, cell = 14) =>
  renderCells({ cols, rows, cell, symbols: [], margin: 0 });

/** A chart of `widths` (bottom first, rows each), right-aligned, as symbol rows. */
function stepped(widths: readonly (readonly [number, number])[], cols: number): string[][] {
  return widths.flatMap(([w, rows]) =>
    Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (_, c) => (c >= cols - w ? 'std:k' : 'std:none')),
    ),
  );
}

describe('arrows beside a chart', () => {
  it('finds the rows an arrow points at, not text or other charts', () => {
    const cell = 14;
    const page = compose(320, 200, [
      { img: plain(4, 8), x: 20, y: 20 },
      { img: plain(3, 3), x: 230, y: 20 },
    ]);
    const draw = (x0: number, x1: number, y: number, h = 2) => {
      for (let y2 = y; y2 < y + h; y2++)
        for (let x = x0; x < x1; x++) page.data[y2 * page.width + x] = 0;
    };
    // An arrow at row 3 from the bottom (the 6th row from the top), and one at the top row.
    draw(20 + 4 * cell + 8, 20 + 4 * cell + 8 + 30, 20 + 5 * cell + 6);
    draw(20 + 4 * cell + 8, 20 + 4 * cell + 8 + 28, 20 + 6);
    // A digit next to it: short and tall, not an arrow.
    draw(20 + 4 * cell + 50, 20 + 4 * cell + 52, 20 + 2 * cell + 2, 10);
    const grids = detectGrids(page);
    const chart = grids.find((g) => g.cols === 4);
    expect(chart).toBeDefined();
    expect(chart && findArrows(page, chart, grids)).toEqual([3, 8]);
  });
});

describe('bands of a chart in steps', () => {
  it('splits at arrows and at jumps of the width, not at one more stitch', () => {
    const rows = stepped(
      [
        [4, 3],
        [6, 4],
        [20, 5],
        [4, 1],
      ],
      20,
    );
    const bands = chartBands(rows, [3, 7, 12]);
    expect(bands.map((b) => [b.from, b.to, b.right - b.left + 1, b.arrow])).toEqual([
      [1, 3, 4, true],
      [4, 7, 6, true],
      [8, 12, 20, true],
      [13, 13, 4, false],
    ]);
    const six = bands[1];
    expect(six && bandRows(rows, six)[0]).toEqual(Array(6).fill('std:k'));
    // A repeat growing by one stitch (an increase inside the chart) stays one band.
    const growing = stepped(
      [
        [5, 2],
        [6, 2],
        [7, 2],
      ],
      7,
    );
    expect(chartBands(growing).map((b) => [b.from, b.to, b.right - b.left + 1])).toEqual([
      [1, 6, 7],
    ]);
  });
});

const WINTERS = `ROZMIARY:
S - M - L - XL
KARCZEK:
Przerobić 0-0-2-2 okrążeń dżersejem. Przerabiać schemat A.1 na okrągło (= 30-31-33-34 motywów po 4 oczka).
Dalej przerabiać tak samo, a gdy schemat A.1 zostanie przerobiony 1 raz, przerabiać schemat A.2 w taki sam sposób.
W TYM SAMYM CZASIE, w każdym z okrążeń oznaczonych strzałką w schematach A.1 i A.2, dodawać oczka jak w opisie poniżej:
ROZMIARY S, M i L:
Strzałka-1: równomiernie dodać 36-38-42 oczka = 156-162-174 oczka (jest teraz wystarczająca liczba oczek, aby
przerobić 26-27-29 motywów po 6 oczek).
Strzałka-2: równomiernie dodać 64-58-66 oczek = 220-220-240 oczek (jest teraz wystarczająca liczba oczek, aby
przerobić 11-11-12 motywów po 20 oczek).
Strzałka-3 (tylko w rozmiarach M i L): równomiernie dodać 4-4 oczka = 220-224-244 oczka (jest teraz wystarczająca liczba oczek, aby przerobić 56-61 motywów po 4 oczka).
ROZMIARY XL:
Strzałka-1: równomiernie dodać 44 oczka = 180 oczek (jest teraz wystarczająca liczba oczek, aby przerobić 30 motywów po 6 oczek).
Strzałka-2: równomiernie dodać 60 oczek = 240 oczek (jest teraz wystarczająca liczba oczek, aby przerobić 12 motywów po 20 oczek).
WSZYSTKIE ROZMIARY:
Dalej przerabiać aż długość robótki wynosi 22-24-26-28 cm.
TYŁ & PRZÓD:
= 192-208-224-244 oczek.
Kończyć schemat A.2 – pamiętać, aby dalej przerabiać schematy A.2 karczku.
Gdy schemat A.2 zostanie przerobiony, przerabiać schemat A.3 na okrągło – w pierwszym okrążeniu równomiernie dodać 0-2-4-2 oczka = 192-210-228-246 oczek. Jest teraz wystarczająca liczba oczek, aby przerobić 32-35-38-41 motywów wg schematu A.3 po 6 oczek.
Powtarzać schemat A.3 na wysokość, aż długość robótki od jej podziału wynosi ok. 27 cm.
Przerabiać schemat A.4 na okrągło – w pierwszym okrążeniu równomiernie zamknąć 0-2-4-2 oczka = 192-208-224-244 oczek (motywy wg schematu A.4 po 4 oczka).
`;
const SIZES = ['S', 'M', 'L', 'XL'];

describe('what the text says about charts worked one after another', () => {
  it('reads the arrows of each size group, the charts they are in and the motif widths', () => {
    const arrows = textArrows(WINTERS, SIZES);
    expect(arrows.map((a) => [a.n, a.total, a.added, a.width])).toEqual([
      [1, [156, 162, 174, 180], [36, 38, 42, 44], [6, 6, 6, 6]],
      [2, [220, 220, 240, 240], [64, 58, 66, 60], [20, 20, 20, 20]],
      // Only in some sizes: a shorter list belongs to the last sizes of the group.
      [3, [220, 224, 244, null], [null, 4, 4, null], [4, 4, 4, null]],
    ]);
    expect(arrowCharts(WINTERS)).toEqual(['A.1', 'A.2']);
    expect([...chartWidths(WINTERS)]).toEqual([
      ['A.3', 6],
      ['A.4', 4],
      ['A.1', 4],
    ]);
  });

  it('reads each part’s charts in working order, with stitches and length', () => {
    const steps = partSteps(WINTERS, 'sweater', SIZES.length);
    expect(steps['yoke']?.map((s) => s.charts)).toEqual([['A.1'], ['A.2']]);
    // "Kończyć schemat A.2" finishes the yoke's chart: not a step of the body.
    expect(steps['back']).toEqual([
      { charts: ['A.3'], stitches: [192, 210, 228, 246], cm: [27, 27, 27, 27] },
      { charts: ['A.4'], stitches: [192, 208, 224, 244] },
    ]);
    // Charts named in one sentence are worked side by side; a count just before is theirs.
    expect(
      textSteps('= 213-233 oczek. Dalej przerabiać schematy A.3 i A.4 w tę i z powrotem.', 2),
    ).toEqual([{ charts: ['A.3', 'A.4'], stitches: [213, 233] }]);
  });

  it('keeps sub-headings and wrapped sentence ends inside the part', () => {
    const blocks = descriptionBlocks(WINTERS, 'sweater');
    expect(blocks.map((b) => [b.type, b.partId, b.heading])).toEqual([
      ['general', null, 'ROZMIARY:'],
      ['part', 'yoke', 'KARCZEK:'],
      ['part', 'back', 'TYŁ & PRZÓD:'],
    ]);
    const wrapped = descriptionBlocks(
      'RĘKAWY:\nPrzerabiać aż długość\nrobótki.\nSTĄD!\n',
      'sweater',
    );
    expect(wrapped.map((b) => b.heading)).toEqual(['RĘKAWY:']);
  });
});

describe('which chart is which', () => {
  const text = `Przerabiać schemat A.1, potem A.2; w okrążeniach oznaczonych strzałką w schematach A.1 i A.2 dodawać oczka:
ROZMIARY S, M i L:
Strzałka-1: równomiernie dodać 36-38-42 oczka = 156-162-174 oczka (26-27-29 motywów po 6 oczek).
Strzałka-2: równomiernie dodać 64-58-66 oczek = 220-220-240 oczek (11-11-12 motywów po 20 oczek).
Strzałka-3: równomiernie dodać 4-4-0 oczka = 224-224-240 oczek (28-28-30 motywów po 8 oczek).
ROZMIARY XL:
Strzałka-1: równomiernie dodać 44 oczka = 180 oczek (30 motywów po 6 oczek).
Strzałka-2: równomiernie dodać 42 oczka = 222 oczka (37 motywów po 6 oczek).
Strzałka-3: równomiernie dodać 18 oczek = 240 oczek (12 motywów po 20 oczek).
Strzałka-4: równomiernie dodać 8 oczek = 248 oczek (31 motywów po 8 oczek).
WSZYSTKIE ROZMIARY:
Przerabiać schemat A.4 na okrągło (motywy wg schematu A.4 po 4 oczka).`;
  // As in a PDF: A.4 and A.2 for S–L on one page, A.1 for S–L on the next, both XL charts on a
  // third. A.2 is drawn the same for both groups; the page tells them apart.
  const charts = [
    { rows: stepped([[4, 6]], 4), source: 0 },
    {
      rows: stepped(
        [
          [4, 3],
          [8, 2],
        ],
        8,
      ),
      arrows: [3],
      source: 0,
    },
    {
      rows: stepped(
        [
          [4, 3],
          [6, 4],
          [20, 5],
        ],
        20,
      ),
      arrows: [3, 7],
      source: 1,
    },
    {
      rows: stepped(
        [
          [4, 2],
          [6, 3],
          [6, 3],
          [20, 6],
        ],
        20,
      ),
      arrows: [2, 5, 8],
      source: 2,
    },
    {
      rows: stepped(
        [
          [4, 3],
          [8, 2],
        ],
        8,
      ),
      arrows: [3],
      source: 2,
    },
  ];

  it('finds the chain of charts of each size group and names the charts from the text', () => {
    const plan = planCharts(charts, text, SIZES);
    expect(plan.chains).toEqual([
      [2, 1],
      [2, 1],
      [2, 1],
      [3, 4],
    ]);
    expect(plan.sizes).toEqual([null, [0, 1, 2], [0, 1, 2], [3], [3]]);
    expect(charts.map((_, i) => planName(plan, i, SIZES))).toEqual([
      'A.4',
      'A.2 (S-M-L)',
      'A.1 (S-M-L)',
      'A.1 (XL)',
      'A.2 (XL)',
    ]);
    expect(chartForSize(plan, 'A.1', 3)).toBe(3);
    expect(chartForSize(plan, 'A.2', 0)).toBe(1);
  });

  it('gives every band its stitches: the count before the first arrow, then each arrow’s', () => {
    const plan = planCharts(charts, text, SIZES);
    const bands = chainStack(plan, [2, 1], 1);
    expect(bands.map((b) => [b.width, b.rows, b.stitches, b.arrow])).toEqual([
      [4, 3, 124, { n: 1, added: 38, total: 162 }],
      [6, 4, 162, { n: 2, added: 58, total: 220 }],
      // The yoke's next motif begins in A.1 and goes on in A.2.
      [20, 5, 220, null],
      [4, 3, 220, { n: 3, added: 4, total: 224 }],
      [8, 2, 224, null],
    ]);
  });

  it('keeps a band that goes on in the next chart as one', () => {
    const plan = planCharts(
      [
        {
          rows: stepped(
            [
              [4, 2],
              [6, 2],
            ],
            6,
          ),
          arrows: [2],
        },
        { rows: stepped([[6, 3]], 6) },
      ],
      'Strzałka-1: równomiernie dodać 4 oczka = 24 oczka (motywów po 6 oczek).',
      [],
    );
    const bands = chainStack({ ...plan, chains: [[0, 1]] }, [0, 1], 0);
    expect(bands.map((b) => [b.width, b.rows, b.pieces.length, b.stitches])).toEqual([
      [4, 2, 1, 20],
      [6, 5, 2, 24],
    ]);
  });
});
