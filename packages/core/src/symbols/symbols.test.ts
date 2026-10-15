import { describe, expect, it } from 'vitest';
import { cable } from './cable';
import { BUILTIN_SYMBOLS, STD } from './library';
import { createRegistry, wsSymbolId } from './registry';
import type { GlyphPoint, SymbolDef } from './types';

const sorted = (xs: readonly string[]) => [...xs].sort().join('');

function glyphPoints(s: SymbolDef): GlyphPoint[] {
  return s.glyph.primitives.flatMap((p) => {
    switch (p.kind) {
      case 'line':
        return [p.from, p.to];
      case 'polyline':
      case 'polygon':
        return [...p.points];
      case 'circle':
        return [p.center];
      case 'text':
        return [p.at];
    }
  });
}

describe('built-in symbol library', () => {
  it('has unique ids', () => {
    const ids = BUILTIN_SYMBOLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(BUILTIN_SYMBOLS.map((s) => [s.id, s] as const))(
    '%s is internally consistent',
    (_id, s) => {
      expect(s.width).toBeGreaterThanOrEqual(1);
      if (s.flow) {
        expect(s.flow.in).toHaveLength(s.consumes);
        expect(s.flow.out).toHaveLength(s.produces);
      }
      for (const [x, y] of glyphPoints(s)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(s.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
      expect(s.label.pl.length).toBeGreaterThan(0);
      expect(s.description.en.length).toBeGreaterThan(0);
      if (s.ws.mode === 'invert')
        expect(BUILTIN_SYMBOLS.some((t) => t.id === wsSymbolId(s))).toBe(true);
    },
  );

  it('cables keep every stitch: width = consumes = produces and the flow is a permutation', () => {
    for (const s of BUILTIN_SYMBOLS.filter((x) => x.family === 'cable')) {
      expect(s.consumes).toBe(s.width);
      expect(s.produces).toBe(s.width);
      expect(sorted(s.flow?.in ?? [])).toBe(sorted(s.flow?.out ?? []));
      expect(s.ws.mode).toBe('unsupported');
    }
  });

  it('WS inversion is an involution for knit/purl and the paired decreases', () => {
    const reg = createRegistry();
    for (const id of [STD.knit, STD.purl, STD.k2tog, STD.p2tog, STD.ssk, STD.ssp]) {
      const once = wsSymbolId(reg.require(id));
      expect(once).toBeDefined();
      expect(wsSymbolId(reg.require(once ?? ''))).toBe(id);
    }
  });

  /**
   * Direction check that fixes the prototype's legend bug: reading right to left, a stitch held in
   * FRONT travels LEFT and one held at the BACK travels RIGHT. Flows are left → right in RS view.
   */
  it('maps DROPS numbers to correctly oriented crossings', () => {
    const reg = createRegistry();
    const byDrops = (n: string) => reg.byNumber('drops', n);
    expect(byDrops('1')?.id).toBe(STD.knit);
    expect(byDrops('21')?.id).toBe(STD.purl);
    expect(byDrops('218')?.flow).toEqual({ in: ['k', 'k'], out: ['k', 'k'] });
    expect(byDrops('201')?.flow).toEqual({ in: ['p', 'k'], out: ['k', 'p'] }); // knit moves left
    expect(byDrops('202')?.flow).toEqual({ in: ['k', 'p'], out: ['p', 'k'] }); // knit moves right
    expect(byDrops('302')?.flow).toEqual({ in: ['k', 'k', 'p'], out: ['p', 'k', 'k'] }); // pair moves right
    expect(byDrops('306')?.flow).toEqual({ in: ['p', 'k', 'k'], out: ['k', 'k', 'p'] }); // pair moves left
    expect(byDrops('401')?.flow).toEqual({ in: ['k', 'k', 'k', 'k'], out: ['k', 'k', 'k', 'k'] });

    // Glyph slope agrees with the direction: "\" (y grows with x) for 201, "/" for 202.
    const slope = (id: string) => {
      const p = reg.require(id).glyph.primitives[0];
      if (p?.kind !== 'line') throw new Error('expected a line glyph');
      return Math.sign((p.to[1] - p.from[1]) / (p.to[0] - p.from[0]));
    };
    expect(slope(byDrops('201')?.id ?? '')).toBe(1);
    expect(slope(byDrops('202')?.id ?? '')).toBe(-1);
  });

  it('describes cables in Polish and English', () => {
    const s = createRegistry().require('cable:2-1-rpc');
    expect(s.description.pl).toContain('za robótką');
    expect(s.description.pl).toContain('2 oczka prawe');
    expect(s.description.pl).toContain('na lewo');
    expect(s.description.en).toContain('at the back');
    const mixed = cable({
      id: 'user:mixed',
      heldAt: 'front',
      fromCableNeedle: ['k', 'p'],
      worked: ['k'],
      glyph: { primitives: [] },
      label: { pl: 'x', en: 'x' },
    });
    expect(mixed.description.pl).toContain('przerób je z drutu pomocniczego.');
    expect(mixed.numbers).toBeUndefined();
  });
});

describe('symbol registry', () => {
  it('rejects custom symbols that reuse an id', () => {
    const k = BUILTIN_SYMBOLS[0];
    if (!k) throw new Error('library is empty');
    expect(() => createRegistry([k])).toThrow(/Duplicate/);
  });

  it('looks symbols up and fails loudly on unknown ids', () => {
    const custom: SymbolDef = {
      ...createRegistry().require(STD.knit),
      id: 'user:twisted',
      numbers: { own: '7' },
    };
    const reg = createRegistry([custom]);
    expect(reg.has('user:twisted')).toBe(true);
    expect(reg.get('nope')).toBeUndefined();
    expect(() => reg.require('nope')).toThrow(/Unknown symbol/);
    expect(reg.byNumber('own', '7')?.id).toBe('user:twisted');
    expect(reg.all().length).toBe(BUILTIN_SYMBOLS.length + 1);
  });

  it('reports no WS form for unsupported symbols and keeps "same" ones', () => {
    const reg = createRegistry();
    expect(wsSymbolId(reg.require('cable:2-2-lc'))).toBeUndefined();
    expect(wsSymbolId(reg.require(STD.yarnOver))).toBe(STD.yarnOver);
    expect(wsSymbolId(reg.require(STD.m1l))).toBe(STD.m1l);
  });
});
