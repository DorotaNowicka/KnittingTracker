import { describe, expect, it } from 'vitest';
import { parseDescription } from './parse';

// A made-up description in the style of Polish patterns (own text).
const TEXT = `KAMIZELKA TESTOWA
ROZMIARY:
S - M - L
Próbka: 22 oczka = 10 cm.
KORPUS:
Nabrać 140-152-164 oczka i przerabiać ściągaczem.
W ostatnim okrążeniu dodać 4 oczka = 144-156-168 oczek.
Umieścić marker na początku okrążenia i drugi marker
za 72-78-84 oczkami = boki. Dalej przerabiać: schemat B.1 ponad 10-13-16
pierwszymi oczkami (zakończyć pierwszym oczkiem schematu B.1), schematy B.2, B.3, B.2,
B.1 ponad 20-26-32 następnymi oczkami, B.2, B.3, B.2, B.1 ponad 10-13-16 ostatnimi oczkami.
Gdy robótka ma 30 cm, przerabiać B.4 nad B.3.`;

describe('description parser (pl)', () => {
  const p = parseDescription(TEXT);

  it('finds the sizes after the heading', () => {
    expect(p.sizes?.value).toEqual(['S', 'M', 'L']);
    expect(TEXT.slice(p.sizes?.span.start, p.sizes?.span.end)).toBe('S - M - L');
  });

  it('finds the chart order with per-size stitch counts, skipping asides in brackets', () => {
    expect(p.sequence?.value.map((s) => s.chart)).toEqual([
      'B.1',
      'B.2',
      'B.3',
      'B.2',
      'B.1',
      'B.2',
      'B.3',
      'B.2',
      'B.1',
    ]);
    expect(p.sequence?.value[0]?.stitches).toEqual([10, 13, 16]);
    expect(p.sequence?.value[4]?.stitches).toEqual([20, 26, 32]);
    expect(p.sequence?.value[1]?.stitches).toBeUndefined();
    const first = p.sequence?.value[0];
    expect(first && TEXT.slice(first.span.start, first.span.end)).toBe('B.1');
  });

  it('finds the stitch count of the round and the side marker', () => {
    expect(p.stitchCount?.value).toEqual([144, 156, 168]);
    expect(p.marker?.value).toEqual([72, 78, 84]);
    expect(p.chartNames).toEqual(['B.1', 'B.2', 'B.3', 'B.4']);
  });

  it('copes with text without sizes or charts', () => {
    const empty = parseDescription('Zwykły tekst bez schematów.');
    expect(empty).toEqual({
      sizes: null,
      chartNames: [],
      sequence: null,
      stitchCount: null,
      marker: null,
    });
    const oneSize = parseDescription('Schematy A.1 ponad 12 oczkami, A.2, A.3.');
    expect(oneSize.sequence?.value[0]?.stitches).toEqual([12]);
  });
});
