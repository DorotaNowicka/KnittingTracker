import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decrease, makePattern, roundStage, rope, seed, zigzag } from '../__tests__/fixtures';
import { parseChart } from '../chart/parse';
import { resolveStage } from '../layout/resolve';
import type { Chart, Pattern } from '../schema/pattern';
import { createRegistry } from '../symbols/registry';
import {
  checkStitchChain,
  checkStitchFlow,
  consumedInRow,
  producedInRow,
  validateChart,
} from './chart';
import { validatePattern } from './pattern';
import { checkWrongSideSymbols, checkZoneEdges, validateStage } from './stage';

const reg = createRegistry();
const codesOf = (c: Chart) =>
  validateChart(parseChart(c, reg), reg).map((d) => `${d.code}@${d.row ?? ''}:${d.col ?? ''}`);

describe('chart checks', () => {
  it('accepts flow-consistent cable charts without findings', () => {
    expect(codesOf(rope)).toEqual([]);
    expect(codesOf(zigzag)).toEqual([]);
  });

  it('counts consumed and produced stitches per row', () => {
    const p = parseChart(decrease, reg);
    expect(consumedInRow(p, 1, reg)).toBe(4);
    expect(producedInRow(p, 1, reg)).toBe(3);
    expect(consumedInRow(p, 2, reg)).toBe(3);
  });

  it('follows the stitch-count chain and warns when a chart cannot repeat vertically', () => {
    expect(
      checkStitchChain(parseChart(decrease, reg), reg).map((d) => [d.code, d.severity]),
    ).toEqual([['chain-wrap', 'warning']]);
    const broken: Chart = { ...decrease, rows: ['tkkx', 'kkkk'] };
    // Row 1 leaves 3 stitches, row 2 needs 4; the top row (4) does feed row 1 (4) again.
    expect(checkStitchChain(parseChart(broken, reg), reg).map((d) => d.code)).toEqual([
      'chain-break',
    ]);
  });

  it('warns when a cable is fed the wrong stitch kind (likely misread cell)', () => {
    // Row 3 should carry the travelled knit stitch in column 2; put it in column 3 instead.
    const misread: Chart = { ...zigzag, rows: ['kppp', 'R.pp', 'ppkp', 'L.pp'] };
    const diags = checkStitchFlow(parseChart(misread, reg), reg);
    expect(
      diags.filter((d) => d.severity === 'warning').map((d) => [d.code, d.row, d.col]),
    ).toEqual([['flow-cable', 4, 2]]);
    expect(diags.some((d) => d.code === 'flow-texture' && d.severity === 'info')).toBe(true);
  });

  it('reports texture changes as info only', () => {
    expect(checkStitchFlow(parseChart(seed, reg), reg).every((d) => d.severity === 'info')).toBe(
      true,
    );
    expect(checkStitchFlow(parseChart(seed, reg), reg, false).length).toBe(2);
  });

  it('skips the flow check for rows with shaping', () => {
    expect(checkStitchFlow(parseChart(decrease, reg), reg)).toEqual([]);
  });

  it('property: charts made only of knit and purl never break the stitch chain', () => {
    const chartArb = fc
      .record({ w: fc.integer({ min: 1, max: 12 }), h: fc.integer({ min: 1, max: 10 }) })
      .chain(({ w, h }) =>
        fc.array(fc.array(fc.constantFrom('k', 'p'), { minLength: w, maxLength: w }), {
          minLength: h,
          maxLength: h,
        }),
      );
    fc.assert(
      fc.property(chartArb, (rows) => {
        const chart: Chart = {
          id: 'r',
          name: 'R',
          width: rows[0]?.length ?? 0,
          height: rows.length,
          palette: { k: 'std:k', p: 'std:p' },
          rows: rows.map((r) => r.join('')),
        };
        const diags = validateChart(parseChart(chart, reg), reg);
        return diags.every((d) => d.severity === 'info');
      }),
    );
  });
});

describe('stage checks', () => {
  it('passes a well-formed stage', () => {
    expect(validateStage(resolveStage(makePattern(), 'body', 0))).toEqual([]);
  });

  it('rejects partial repeats that cut through a cable', () => {
    const p = makePattern({
      stages: [
        {
          ...roundStage,
          expectedStitches: 9,
          layout: [{ kind: 'chart', placementId: 'r', chartId: 'rope', stitches: 9 }],
        },
      ],
    });
    const diags = checkZoneEdges(resolveStage(p, 'body', 0));
    expect(diags.map((d) => d.code)).toContain('zone-cuts-symbol');
    // Whole repeats are fine, also with an offset start column that keeps the cable intact.
    const ok = makePattern({
      stages: [
        {
          ...roundStage,
          expectedStitches: 12,
          layout: [{ kind: 'chart', placementId: 'r', chartId: 'rope', stitches: 12 }],
        },
      ],
    });
    expect(checkZoneEdges(resolveStage(ok, 'body', 0))).toEqual([]);
  });

  it('rejects cables on wrong-side rows of flat stages', () => {
    const p = makePattern({
      stages: [
        {
          id: 'f',
          name: 'Flat',
          construction: 'flat',
          firstRowSide: 'RS',
          layout: [{ kind: 'chart', placementId: 'r', chartId: 'rope', rowOffset: 1 }],
        },
      ],
    });
    // Rope row 1 (the cable) now lands on stage rows 6, 12, … — row 6 is a WS row.
    const diags = checkWrongSideSymbols(resolveStage(p, 'f', 0));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ code: 'ws-unsupported', row: 1, chartId: 'rope' });
    // Without the offset, the cable falls on odd = RS rows only.
    const fine = makePattern({
      stages: [
        {
          id: 'f',
          name: 'Flat',
          construction: 'flat',
          firstRowSide: 'RS',
          layout: [{ kind: 'chart', placementId: 'r', chartId: 'rope' }],
        },
      ],
    });
    expect(checkWrongSideSymbols(resolveStage(fine, 'f', 0))).toEqual([]);
    expect(checkWrongSideSymbols(resolveStage(makePattern(), 'body', 0))).toEqual([]);
  });
});

describe('validatePattern', () => {
  it('accepts the synthetic pattern (info-level texture notes only)', () => {
    const report = validatePattern(makePattern());
    expect(report.ok).toBe(true);
    expect(report.diagnostics.filter((d) => d.severity !== 'info').map((d) => d.code)).toEqual([
      'chain-wrap',
    ]);
  });

  it('reports referential problems before anything else', () => {
    const bad: Pattern = makePattern({
      charts: [seed, seed, rope, zigzag],
      legend: [{ symbolId: 'std:nope' }],
      stages: [
        {
          ...roundStage,
          rows: [1, 2, 3],
          layout: [
            ...roundStage.layout,
            { kind: 'chart', placementId: 'f1', chartId: 'ghost', stitches: [1] },
          ],
        },
        { ...roundStage },
      ],
    });
    const codes = validatePattern(bad).diagnostics.map((d) => d.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'duplicate-chart',
        'duplicate-stage',
        'legend-unknown-symbol',
        'duplicate-placement',
        'size-list',
        'unknown-chart',
      ]),
    );
    expect(validatePattern(bad).ok).toBe(false);
  });

  it('reports symbol table problems', () => {
    const bad = makePattern({
      symbols: [
        { ...customK, id: 'user:a' },
        { ...customK, id: 'user:a' },
      ],
    });
    expect(validatePattern(bad)).toMatchObject({ ok: false, diagnostics: [{ code: 'symbols' }] });
  });

  it('validates stages per size and labels findings with the size', () => {
    const p = makePattern({ stages: [{ ...roundStage, expectedStitches: [26, 31] }] });
    const report = validatePattern(p);
    expect(report.ok).toBe(false);
    expect(report.diagnostics.find((d) => d.code === 'stitch-count')?.message).toMatch(/^\[M\]/);
  });

  it('validates replacement charts from modifications', () => {
    const report = validatePattern(makePattern(), [
      { kind: 'replaceChart', chartId: 'seed', chart: { ...seed, rows: ['kq', 'pk'] } },
    ]);
    expect(report.diagnostics.map((d) => d.code)).toContain('unknown-cell');
  });

  it('skips stage checks when charts are structurally broken', () => {
    const p = makePattern({ charts: [{ ...seed, rows: ['k'] }, rope, zigzag, decrease] });
    const report = validatePattern(p);
    expect(report.ok).toBe(false);
    expect(report.diagnostics.every((d) => d.stageId === undefined)).toBe(true);
  });
});

const customK = {
  id: 'user:k',
  family: 'basic' as const,
  width: 1,
  consumes: 1,
  produces: 1,
  worked: true,
  ws: { mode: 'same' as const },
  glyph: { primitives: [] },
  label: { pl: 'k', en: 'k' },
  description: { pl: 'k', en: 'k' },
};
