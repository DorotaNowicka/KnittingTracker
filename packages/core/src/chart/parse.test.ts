import { describe, expect, it } from 'vitest';
import { rope, zigzag } from '../__tests__/fixtures';
import type { Chart } from '../schema/pattern';
import { createRegistry } from '../symbols/registry';
import { chartCell, chartFromSymbolRows, parseChart } from './parse';

const reg = createRegistry();
const codes = (c: Chart) => parseChart(c, reg).diagnostics.map((d) => d.code);

describe('parseChart', () => {
  it('parses multi-cell symbols into anchor + continuation cells', () => {
    const p = parseChart(rope, reg);
    expect(p.diagnostics).toEqual([]);
    expect(chartCell(p, 1, 2)).toEqual({
      symbolId: 'cable:2-2-lc',
      anchorCol: 2,
      part: 0,
      width: 4,
    });
    expect(chartCell(p, 1, 5)).toEqual({
      symbolId: 'cable:2-2-lc',
      anchorCol: 2,
      part: 3,
      width: 4,
    });
    expect(chartCell(p, 1, 6).symbolId).toBe('std:p');
    expect(() => chartCell(p, 7, 1)).toThrow(RangeError);
  });

  it('reports structural problems without throwing', () => {
    const base: Chart = { ...zigzag, rows: [...zigzag.rows] };
    expect(codes({ ...base, height: 5 })).toContain('chart-height');
    expect(codes({ ...base, rows: ['kpp', 'R.pp', 'pkpp', 'L.pp'] })).toContain('row-width');
    expect(codes({ ...base, rows: ['.ppp', 'R.pp', 'pkpp', 'L.pp'] })).toContain(
      'orphan-continuation',
    );
    expect(codes({ ...base, rows: ['kppp', 'Rppp', 'pkpp', 'L.pp'] })).toContain(
      'symbol-truncated',
    );
    expect(codes({ ...base, rows: ['kppp', 'R.pp', 'pkpp', 'ppkL'] })).toContain('symbol-overflow');
    expect(codes({ ...base, rows: ['kppZ', 'R.pp', 'pkpp', 'L.pp'] })).toContain('unknown-cell');
    expect(codes({ ...base, palette: { ...base.palette, '.': 'std:k' } })).toContain(
      'palette-reserved',
    );
    expect(codes({ ...base, palette: { ...base.palette, Q: 'std:nope' } })).toContain(
      'palette-unknown-symbol',
    );
  });

  it('flags a truncated symbol at the end of a row', () => {
    const c: Chart = {
      id: 't',
      name: 'T',
      width: 3,
      height: 1,
      palette: { k: 'std:k', C: 'cable:2-2-lc' },
      rows: ['kC.'],
    };
    expect(codes(c)).toEqual(expect.arrayContaining(['symbol-overflow', 'symbol-truncated']));
  });

  it('builds charts from symbol rows with a generated palette', () => {
    const chart = chartFromSymbolRows({ id: 'x', name: 'X' }, [
      ['std:k', 'cable:1-1-rc', '.', 'std:p'],
      ['std:p', 'std:p', 'std:k', 'std:yo'],
    ]);
    expect(chart.width).toBe(4);
    expect(chart.height).toBe(2);
    expect(chart.palette['k']).toBe('std:k');
    expect(chart.palette['p']).toBe('std:p');
    expect(parseChart(chart, reg).diagnostics).toEqual([]);
    expect(chart.rows[0]?.[2]).toBe('.');
    expect(chartFromSymbolRows({ id: 'e', name: 'E' }, []).width).toBe(0);
  });
});
