import { createRegistry } from '@kt/core';
import { describe, expect, it } from 'vitest';
import { compose, rng } from './__tests__/synth';
import { colorOfName, iconColor, legendKind, materialColors } from './legend/color';
import type { LegendItem } from './legend/pair';
import { documentText } from './pdf/analyze';
import { assignLegendColors, importImage, legendColors } from './pipeline';
import { libraryTemplates, recognizeGrid } from './raster/classify';
import { renderCells } from './raster/draw';
import { assignFillColors } from './raster/fills';
import { detectGrids } from './raster/grid';

const reg = createRegistry();

/** A plain chart picture: `cols` × `rows` empty cells. */
const plain = (cols: number, rows: number, cell = 14) =>
  renderCells({ cols, rows, cell, symbols: [], margin: 0 });

const item = (text: string, kind: LegendItem['kind'] = 'stitch'): LegendItem => ({
  page: 0,
  icon: { rgba: new Uint8ClampedArray(4), width: 1, height: 1 },
  gray: { width: 1, height: 1, data: new Uint8Array([255]) },
  cells: 1,
  text,
  meaning: null,
  matches: [],
  symbolId: null,
  confidence: 0,
  kind,
});

describe('colourwork legends', () => {
  it('tells colours, marks and stitches apart', () => {
    expect(legendKind('kolor Jasny Beż / Jasny Dąb')).toEqual({
      kind: 'color',
      colorName: 'Jasny Beż / Jasny Dąb',
    });
    expect(legendKind('antracyt')).toEqual({ kind: 'color', colorName: 'antracyt' });
    expect(legendKind('okrążenie z dodawaniem oczek').kind).toBe('mark');
    expect(legendKind('rząd z dodawaniem oczek').kind).toBe('mark');
    expect(legendKind('oczko środkowe').kind).toBe('mark');
    expect(legendKind('oczko prawe na prawej stronie').kind).toBe('stitch');
    expect(legendKind('symetrycznie dodać 1 oczko').kind).toBe('stitch');
    // A word the dictionary doesn't know is a colour when the yarn list names it.
    expect(legendKind('Kora').kind).toBe('color');
    expect(legendKind('mgła').kind).toBe('stitch');
    expect(legendKind('mgła', ['mgła']).kind).toBe('color');
    expect(materialColors('500 g kolor 53, antracyt\n150 g kolor 01, ecru')).toEqual([
      'antracyt',
      'ecru',
    ]);
    expect(colorOfName('Szaro-Brązowy Jasny')).toBe('#8a7b6a');
  });

  it('gives colour entries their letters and shades', () => {
    const red = new Uint8ClampedArray(10 * 10 * 4).map((_, i) => [200, 40, 30, 255][i % 4] ?? 255);
    expect(iconColor(red, 10, 10)).toBe('#c8281e');
    // A black mark on paper is no colour of its own.
    const mark = new Uint8ClampedArray(10 * 10 * 4).fill(255);
    for (let y = 4; y < 6; y++)
      for (let x = 0; x < 10; x++) mark.set([0, 0, 0, 255], (y * 10 + x) * 4);
    expect(iconColor(mark, 10, 10)).toBeNull();

    const legend = assignLegendColors(
      [
        { ...item('antracyt', 'color'), color: { name: 'antracyt', fill: null } },
        item('ecru'),
        item('oczko środkowe', 'mark'),
      ],
      ['ecru'],
    );
    expect(legend.map((l) => [l.kind, l.symbolId])).toEqual([
      ['color', 'color:A'],
      ['color', 'color:B'],
      ['mark', null],
    ]);
    expect(legendColors(legend)).toEqual([
      { id: 'A', name: 'antracyt', hex: '#3b3f45' },
      { id: 'B', name: 'ecru', hex: '#efe7d4' },
    ]);
  });
});

describe('charts in colourwork', () => {
  it('finds a chart in steps and leaves no stitch where it is narrow', () => {
    // A 10 × 3 band with a 4 × 4 band under its right end, sharing the rule between them.
    const page = compose(260, 160, [
      { img: plain(10, 3), x: 20, y: 20 },
      { img: plain(4, 4), x: 20 + 6 * 14, y: 20 + 3 * 14 },
    ]);
    const [grid] = detectGrids(page);
    expect(grid && [grid.cols, grid.rows]).toEqual([10, 7]);
    expect(grid?.missing?.map((row) => row.map((m) => (m ? ' ' : '#')).join(''))).toEqual([
      '##########',
      '##########',
      '##########',
      '      ####',
      '      ####',
      '      ####',
      '      ####',
    ]);
    const templates = libraryTemplates(reg.require('std:k'));
    const read = grid ? recognizeGrid(page, grid, templates) : null;
    // Row 1 (bottom) is the narrow band: six cells of no stitch, then four knit.
    expect(read?.cells[0]?.map((c) => (c.symbolId === 'std:none' ? '-' : 'k')).join('')).toBe(
      '------kkkk',
    );
  });

  it('reads the yarn of each cell of a chart printed in colour', () => {
    const r = rng(3);
    const cols = 8;
    const rows = 5;
    const cell = 16;
    const truth = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (r() < 0.4 ? 'B' : 'A')),
    );
    const w = cols * cell + 40;
    const h = rows * cell + 40;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    const paint = (x: number, y: number, c: readonly number[]) =>
      rgba.set([...c, 255], (y * w + x) * 4);
    truth.forEach((row, rTop) =>
      row.forEach((y, c) => {
        const col = y === 'B' ? [180, 40, 40] : [235, 225, 200];
        for (let py = 0; py < cell; py++)
          for (let px = 0; px < cell; px++) paint(20 + c * cell + px, 20 + rTop * cell + py, col);
      }),
    );
    // Rules.
    for (let k = 0; k <= cols; k++)
      for (let py = 0; py <= rows * cell; py++) paint(20 + k * cell, 20 + py, [40, 40, 40]);
    for (let k = 0; k <= rows; k++)
      for (let px = 0; px <= cols * cell; px++) paint(20 + px, 20 + k * cell, [40, 40, 40]);
    const result = importImage({ width: w, height: h, rgba });
    const chart = result.charts[0];
    expect(chart && [chart.grid.cols, chart.grid.rows]).toEqual([cols, rows]);
    expect(result.colors.length).toBe(2);
    const red = result.colors.find((c) => (c.hex ?? '').startsWith('#b'))?.id;
    const read = [...(chart?.recognized.cells ?? [])]
      .reverse()
      .map((row) => row.map((c) => (c.color === red ? 'B' : 'A')).join(''));
    expect(read).toEqual(truth.map((row) => row.join('')));
    // Known colours keep their letters.
    if (chart) {
      const again = assignFillColors(rgba, w, chart.grid, chart.recognized, [
        { id: 'C', hex: '#b42828' },
      ]);
      expect(again?.colors.map((c) => c.id).sort()).toEqual(['A', 'C']);
    }
  });

  it('leaves out page headers and footers repeated on every page', () => {
    const page = (n: number, body: string) => ({
      index: n,
      width: 600,
      height: 800,
      images: [],
      segments: [],
      fills: [],
      texts: [
        { str: `10/28/26, 8:27 PM Sweter`, x: 10, y: 10, w: 200, h: 8 },
        { str: body, x: 10, y: 100, w: 200, h: 10 },
        { str: `https://example.com/wzor ${n + 1}/3`, x: 10, y: 790, w: 200, h: 8 },
      ],
    });
    expect(
      documentText({ pages: [page(0, 'KORPUS:'), page(1, 'RĘKAWY'), page(2, 'DEKOLT')] }),
    ).toBe('KORPUS:\nRĘKAWY\nDEKOLT');
  });
});

describe('sizes', () => {
  it('reads a size list with en dashes on the line after the heading', async () => {
    const { parseDescription } = await import('./describe/parse');
    expect(
      parseDescription('ROZMIARY:\nS – M – L – XL – XXL – XXXL\nMATERIAŁ: 500-550 g').sizes?.value,
    ).toEqual(['S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  });
});
