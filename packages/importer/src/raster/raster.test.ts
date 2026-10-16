import { chartToSymbolRows, createRegistry, type Chart } from '@kt/core';
import { describe, expect, it } from 'vitest';
import {
  compose,
  degrade,
  drawChart,
  photograph,
  randomChart,
  rng,
  type Style,
} from '../__tests__/synth';
import { DEFAULT_SYMBOLS } from '../pipeline';
import { libraryTemplates, recognizeGrid, type RecognizedChart } from './classify';
import { renderCells } from './draw';
import { binarize, createGray, crop, meanGray, otsuThreshold, resample, toGray } from './gray';
import { detectGrids } from './grid';
import { homography, project, straighten } from './warp';

const reg = createRegistry();
const templates = DEFAULT_SYMBOLS.flatMap((id) => libraryTemplates(reg.require(id)));

/** Cells (anchors and continuations) that differ from the truth. */
function cellErrors(rec: RecognizedChart, chart: Chart): number {
  const truth = chartToSymbolRows(chart);
  let n = 0;
  rec.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if ((cell.part === 0 ? cell.symbolId : '.') !== truth[r]?.[c]) n += 1;
    }),
  );
  return n;
}

describe('grey images', () => {
  it('converts, samples, crops and resamples', () => {
    const g = toGray(new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]), 2, 1, 4);
    expect(g.data[0]).toBe(76);
    expect(g.data[1]).toBe(255); // transparent → paper
    expect(toGray(new Uint8Array([10, 20]), 2, 1, 1).data).toEqual(new Uint8Array([10, 20]));
    const img = createGray(10, 10);
    img.data[55] = 0;
    expect(crop(img, 5, 5, 2, 2).data[0]).toBe(0);
    expect(resample(img, 0, 0, 10, 10, 5, 5).data.some((v) => v < 255)).toBe(true);
    expect(meanGray(createGray(0, 0))).toBe(255);
  });

  it('finds an ink threshold between paper and ink, globally and locally', () => {
    const img = createGray(40, 40);
    for (let i = 0; i < 400; i++) img.data[i] = 30;
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(255);
    expect(binarize(img).reduce((a, b) => a + b, 0)).toBe(400);
    expect(binarize(img, 'local', 15).reduce((a, b) => a + b, 0)).toBeGreaterThan(250);
  });
});

describe('grid detection', () => {
  it('finds several charts of different sizes in one image and their exact dimensions', () => {
    const r = rng(1);
    const a = randomChart(r, reg, DEFAULT_SYMBOLS, 12, 8);
    const b = randomChart(r, reg, DEFAULT_SYMBOLS, 3, 6);
    const c = randomChart(r, reg, DEFAULT_SYMBOLS, 20, 4);
    const page = compose(700, 420, [
      { img: drawChart(a, reg, { cell: 14 }), x: 20, y: 20 },
      { img: drawChart(b, reg, { cell: 14 }), x: 300, y: 30 },
      { img: drawChart(c, reg, { cell: 14 }), x: 40, y: 260 },
    ]);
    const grids = detectGrids(page);
    expect(grids.map((g) => [g.cols, g.rows])).toEqual([
      [12, 8],
      [3, 6],
      [20, 4],
    ]);
    expect(grids[0]?.pitch).toBeCloseTo(14, 0);
  });

  it('ignores frames, lines and text-like marks that are not a square lattice', () => {
    const img = createGray(300, 200);
    // A rectangle frame and a few long lines.
    for (let x = 20; x < 280; x++) {
      img.data[20 * 300 + x] = 0;
      img.data[180 * 300 + x] = 0;
      img.data[100 * 300 + x] = 0;
    }
    for (let y = 20; y < 180; y++) {
      img.data[y * 300 + 20] = 0;
      img.data[y * 300 + 279] = 0;
    }
    expect(detectGrids(img)).toEqual([]);
    expect(detectGrids(createGray(50, 50))).toEqual([]);
  });
});

describe('recognition accuracy on synthetic charts (target ≥ 99 % of cells)', () => {
  const styles: Style[] = [
    { cell: 12 },
    { cell: 10.6, stroke: 2.2, rule: 1, ruleGray: 40 },
    { cell: 16, stroke: 2, rule: 1.5, ruleGray: 120 },
    { cell: 22, stroke: 3.5, rule: 2, ruleGray: 0 },
    { cell: 9, stroke: 1.4, rule: 1, ruleGray: 90 },
  ];
  let cells = 0;
  let errors = 0;

  it.each(styles.map((s, i) => [i, s] as const))('style %i', (i, style) => {
    const r = rng(100 + i);
    for (let k = 0; k < 3; k++) {
      const chart = randomChart(r, reg, DEFAULT_SYMBOLS, 10 + k * 7, 8 + k * 3);
      const img = degrade(drawChart(chart, reg, style), r, 8);
      const [grid] = detectGrids(img);
      expect(grid?.cols).toBe(chart.width);
      expect(grid?.rows).toBe(chart.height);
      if (!grid) return;
      const rec = recognizeGrid(img, grid, templates);
      cells += chart.width * chart.height;
      errors += cellErrors(rec, chart);
    }
  });

  it('reaches the target over all styles', () => {
    expect(cells).toBeGreaterThan(1000);
    expect(1 - errors / cells).toBeGreaterThanOrEqual(0.99);
  });
});

describe('photos: crop & straighten', () => {
  it('maps the four corners exactly', () => {
    const from = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    const to = [
      [5, 3],
      [40, 8],
      [38, 50],
      [2, 44],
    ] as const;
    const h = homography(from, to);
    expect(h).not.toBeNull();
    if (!h) return;
    for (let i = 0; i < 4; i++) {
      const [x, y] = project(h, from[i]?.[0] ?? 0, from[i]?.[1] ?? 0);
      expect(x).toBeCloseTo(to[i]?.[0] ?? 0, 6);
      expect(y).toBeCloseTo(to[i]?.[1] ?? 0, 6);
    }
    expect(
      homography(
        [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        to,
      ),
    ).toBeNull();
  });

  it('a photographed chart is read correctly after straightening, even with uneven light', () => {
    const r = rng(7);
    const chart = randomChart(r, reg, DEFAULT_SYMBOLS, 14, 10);
    const flat = drawChart(chart, reg, {
      cell: 18,
      stroke: 2.6,
      rule: 1.2,
      ruleGray: 60,
      margin: 6,
    });
    const corners = [
      [60, 40],
      [60 + flat.width * 1.1, 70],
      [40 + flat.width * 1.15, 90 + flat.height * 1.1],
      [30, 60 + flat.height * 1.05],
    ] as const;
    const photo = degrade(photograph(flat, corners, flat.width + 160, flat.height + 200), r, 9, 60);
    // Without straightening the lattice is not regular enough to be read as this chart.
    const tilted = detectGrids(photo, { threshold: 'local' })[0];
    expect(tilted && tilted.cols === chart.width && tilted.rows === chart.height).not.toBe(true);
    const upright = straighten(photo, corners);
    const [grid] = detectGrids(upright, { threshold: 'local' });
    expect([grid?.cols, grid?.rows]).toEqual([chart.width, chart.height]);
    if (!grid) return;
    const rec = recognizeGrid(upright, grid, templates);
    expect(cellErrors(rec, chart) / (chart.width * chart.height)).toBeLessThanOrEqual(0.01);
  });
});

describe('rasterizer', () => {
  it('draws strokes, fills, circles and shaded cells', () => {
    const img = renderCells({
      cols: 4,
      rows: 1,
      cell: 20,
      symbols: [
        { row: 1, col: 1, width: 1, glyph: reg.require('std:p').glyph },
        { row: 1, col: 2, width: 1, glyph: reg.require('std:yo').glyph },
        { row: 1, col: 3, width: 1, glyph: reg.require('std:none').glyph },
        {
          row: 1,
          col: 4,
          width: 1,
          glyph: { primitives: [{ kind: 'text', at: [0.5, 0.5], text: 'B', size: 0.6 }] },
        },
      ],
    });
    const at = (x: number, y: number) => img.data[y * img.width + x] ?? 255;
    expect(at(10, 10)).toBeLessThan(100); // purl dash
    expect(at(30, 10)).toBe(255); // inside the yarn-over ring
    expect(at(30, 5)).toBeLessThan(150); // the ring itself
    expect(at(50, 10)).toBeLessThan(255); // shaded no-stitch cell
    expect(at(50, 10)).toBeGreaterThan(150);
    expect(at(70, 10)).toBeLessThan(at(50, 10)); // text blob
  });
});
