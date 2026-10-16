import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rope, zigzag } from '../__tests__/fixtures';
import { CONTINUATION } from '../schema/pattern';
import { STD } from '../symbols/library';
import { createRegistry } from '../symbols/registry';
import { parseChart } from './parse';
import {
  anchorAt,
  applySymbolRows,
  blankChart,
  chartToSymbolRows,
  copyRect,
  deleteColumns,
  deleteRows,
  fillRect,
  insertColumns,
  insertRows,
  mirrorRect,
  mirrorSymbolId,
  normalizeRect,
  paintCell,
  pasteClip,
  repairRows,
  resizeRows,
  snapRect,
  symbolUsage,
  type SymbolRows,
} from './edit';

const reg = createRegistry();
const K = STD.knit;
const P = STD.purl;
const C4 = 'cable:2-2-lc';
const R2 = 'cable:1-1-rpc';
const L2 = 'cable:1-1-lpc';
const dot = CONTINUATION;

/** A grid is well formed when it parses without structural diagnostics. */
function wellFormed(rows: SymbolRows): boolean {
  const chart = applySymbolRows(blankChart({ id: 't', name: 'T' }, 1, 1), rows);
  return parseChart(chart, reg).diagnostics.length === 0;
}

const row = (s: string) =>
  Array.from(s).map((ch) => ({ k: K, p: P, C: C4, R: R2, L: L2, '.': dot })[ch] ?? K);

describe('conversion', () => {
  it('round-trips a chart and keeps its palette keys', () => {
    const rows = chartToSymbolRows(rope);
    expect(rows[0]).toEqual([P, C4, dot, dot, dot, P]);
    const back = applySymbolRows(rope, rows);
    expect(back).toEqual(rope);
  });

  it('assigns new keys only to new symbols and drops unused ones', () => {
    const rows = chartToSymbolRows(rope).map((r) => r.map((id) => (id === P ? STD.yarnOver : id)));
    const next = applySymbolRows(rope, rows);
    expect(next.palette).toEqual({ k: K, C: C4, a: STD.yarnOver });
    expect(next.rows[0]).toBe('aC...a');
  });

  it('creates blank charts', () => {
    const c = blankChart({ id: 'x', name: 'X' }, 3, 2, P);
    expect(c).toMatchObject({ width: 3, height: 2, palette: { p: P }, rows: ['ppp', 'ppp'] });
  });

  it('maps unknown characters to the fill', () => {
    const rows = chartToSymbolRows({ ...rope, rows: ['?kkkkp', ...rope.rows.slice(1)] });
    expect(rows[0]?.[0]).toBe(K);
  });

  it('counts symbol usage', () => {
    expect([...symbolUsage(chartToSymbolRows(rope)).entries()][0]).toEqual([K, 20]);
  });
});

describe('repairRows', () => {
  it('replaces truncated symbols and orphan continuations', () => {
    expect(repairRows([[C4, dot, K, dot, dot]], reg)).toEqual([[K, K, K, K, K]]);
    expect(repairRows([[K, C4, dot, dot]], reg)).toEqual([[K, K, K, K]]);
    expect(repairRows([['nope', K]], reg)).toEqual([[K, K]]);
  });
});

describe('paintCell', () => {
  const base = [row('pkkkkp'), row('pC...p')];

  it('paints a single cell', () => {
    expect(paintCell(base, reg, 1, 2, P)[0]).toEqual(row('ppkkkp'));
  });

  it('removes a symbol it overlaps, entirely', () => {
    expect(paintCell(base, reg, 2, 4, P)[1]).toEqual(row('pkkpkp'));
  });

  it('places wide symbols and shifts them to fit', () => {
    expect(paintCell(base, reg, 1, 2, C4)[0]).toEqual(row('pC...p'));
    expect(paintCell(base, reg, 1, 6, C4)[0]).toEqual(row('pkC...'));
  });

  it('ignores rows outside the chart', () => {
    expect(paintCell(base, reg, 5, 1, P)).toEqual(base);
  });

  it('anchorAt finds the leftmost cell of a symbol', () => {
    expect(anchorAt(base, 2, 5)).toBe(2);
    expect(anchorAt(base, 1, 5)).toBe(5);
  });
});

describe('rectangles', () => {
  const base = [row('kkkkkk'), row('pC...p'), row('kkkkkk')];

  it('normalizes and clamps', () => {
    expect(normalizeRect({ row1: 9, col1: 4, row2: 0, col2: 2 }, 6, 3)).toEqual({
      row1: 1,
      row2: 3,
      col1: 2,
      col2: 4,
    });
  });

  it('snaps to whole symbols', () => {
    expect(snapRect(base, reg, { row1: 1, row2: 2, col1: 3, col2: 3 })).toEqual({
      row1: 1,
      row2: 2,
      col1: 2,
      col2: 5,
    });
  });

  it('fills and tiles', () => {
    expect(fillRect(base, reg, { row1: 1, row2: 1, col1: 1, col2: 6 }, P)[0]).toEqual(
      row('pppppp'),
    );
    expect(fillRect(base, reg, { row1: 3, row2: 3, col1: 1, col2: 6 }, R2)[2]).toEqual(
      row('R.R.R.'),
    );
    // Too narrow for the symbol: the cells are cleared to the fill.
    expect(fillRect(base, reg, { row1: 2, row2: 2, col1: 3, col2: 4 }, C4)[1]).toEqual(
      row('pkkkkp'),
    );
  });

  it('copies and pastes whole symbols', () => {
    const clip = copyRect(base, reg, { row1: 2, row2: 2, col1: 4, col2: 4 });
    expect(clip).toEqual({ width: 4, height: 1, rows: [[C4, dot, dot, dot]] });
    expect(pasteClip(base, reg, clip, 1, 1)[0]).toEqual(row('C...kk'));
    // Clipped at the right edge: the cut cable becomes knit.
    expect(pasteClip(base, reg, clip, 3, 4)[2]).toEqual(row('kkkkkk'));
    // Pasting over part of a cable removes that cable.
    expect(pasteClip(base, reg, { width: 1, height: 1, rows: [[P]] }, 2, 3)[1]).toEqual(
      row('pkpkkp'),
    );
  });

  it('mirrors horizontally, swapping symbol directions', () => {
    const z = [row('kR.p')];
    expect(mirrorRect(z, reg, { row1: 1, row2: 1, col1: 1, col2: 4 }, 'horizontal')[0]).toEqual(
      row('pL.k'),
    );
    expect(mirrorSymbolId(STD.k2tog)).toBe(STD.ssk);
    expect(mirrorSymbolId(STD.yarnOver)).toBe(STD.yarnOver);
  });

  it('mirrors vertically', () => {
    const out = mirrorRect(base, reg, { row1: 1, row2: 2, col1: 1, col2: 6 }, 'vertical');
    expect(out[0]).toEqual(row('pC...p'));
    expect(out[1]).toEqual(row('kkkkkk'));
  });

  it('a double horizontal mirror is the identity', () => {
    const rows = chartToSymbolRows(zigzag);
    const all = { row1: 1, row2: 4, col1: 1, col2: 4 };
    expect(mirrorRect(mirrorRect(rows, reg, all, 'horizontal'), reg, all, 'horizontal')).toEqual(
      rows,
    );
  });
});

describe('dimensions', () => {
  const base = [row('pC...p'), row('kkkkkk')];

  it('resizes from each anchor', () => {
    expect(resizeRows(base, reg, 7, 3)).toEqual([row('pC...pk'), row('kkkkkkk'), row('kkkkkkk')]);
    expect(resizeRows(base, reg, 7, 1, { x: 'right', y: 'top' })).toEqual([row('kkkkkkk')]);
    // Cutting through the cable replaces it.
    expect(resizeRows(base, reg, 3, 2)[0]).toEqual(row('pkk'));
    expect(resizeRows(base, reg, 0, 0)).toEqual([row('p')]);
  });

  it('inserts and deletes rows', () => {
    expect(insertRows(base, 1)).toEqual([row('pC...p'), row('kkkkkk'), row('kkkkkk')]);
    expect(insertRows(base, 0, 1, P)[0]).toEqual(row('pppppp'));
    expect(deleteRows(base, 2, 2)).toEqual([row('pC...p')]);
    expect(deleteRows(base, 1, 9)).toEqual([row('pC...p')]);
  });

  it('inserts and deletes columns', () => {
    expect(insertColumns(base, reg, 1, 1, P)[0]).toEqual(row('ppC...p'));
    expect(insertColumns(base, reg, 3)[0]).toEqual(row('pkkkkkp'));
    expect(deleteColumns(base, reg, 6, 6)[0]).toEqual(row('pC...'));
    expect(deleteColumns(base, reg, 3, 3)[0]).toEqual(row('pkkkp'));
    expect(deleteColumns(base, reg, 1, 6)).toEqual([row('p'), row('k')]);
  });
});

describe('properties: every edit leaves a well-formed chart', () => {
  const ids = [K, P, C4, R2, L2, STD.yarnOver, STD.k2tog];
  const grid = fc
    .record({ w: fc.integer({ min: 1, max: 9 }), h: fc.integer({ min: 1, max: 5 }) })
    .chain(({ w, h }) =>
      fc.array(fc.array(fc.constantFrom(...ids, dot), { minLength: w, maxLength: w }), {
        minLength: h,
        maxLength: h,
      }),
    )
    .map((rows) => repairRows(rows, reg));
  const pos = fc.integer({ min: -2, max: 11 });

  it('paint, fill, paste, mirror, resize and column edits', () => {
    fc.assert(
      fc.property(grid, pos, pos, pos, pos, fc.constantFrom(...ids), (rows, a, b, c, d, id) => {
        const rect = { row1: a, col1: b, row2: c, col2: d };
        const results = [
          paintCell(rows, reg, a, b, id),
          fillRect(rows, reg, rect, id),
          pasteClip(rows, reg, copyRect(rows, reg, rect), c, d),
          mirrorRect(rows, reg, rect, 'horizontal'),
          mirrorRect(rows, reg, rect, 'vertical'),
          resizeRows(rows, reg, Math.abs(a) + 1, Math.abs(c) + 1, { x: 'right', y: 'top' }),
          insertColumns(rows, reg, b, 2),
          deleteColumns(rows, reg, b, d),
        ];
        return results.every(wellFormed);
      }),
    );
  });
});
