import { createRegistry } from '@kt/core';
import { describe, expect, it } from 'vitest';
import { cableId, readLegendText } from './text';

const reg = createRegistry();
// Own wording in the usual structure of Polish legends (not copied from any pattern).
const cable = (held: string, at: string, worked: string, kind: string, cn: string) =>
  `= zdjąć ${held} na drut pomocniczy z ${at} robótki, przerobić ${worked} ${kind}, ${held} z drutu pomocniczego przerobić na ${cn}`;

describe('legend text (pl)', () => {
  it('reads knit, purl, yarn over and simple decreases', () => {
    expect(readLegendText('= 1 oczko prawe na prawej stronie, lewe na lewej', reg)?.symbolId).toBe(
      'std:k',
    );
    expect(readLegendText('oczko lewe na prawej stronie robótki', reg)?.symbolId).toBe('std:p');
    expect(readLegendText('= narzut', reg)?.symbolId).toBe('std:yo');
    expect(readLegendText('= 2 oczka razem na prawo', reg)?.symbolId).toBe('std:k2tog');
    expect(readLegendText('przerobić 2 oczka razem na lewo', reg)?.symbolId).toBe('std:p2tog');
    expect(readLegendText('= brak oczka', reg)?.symbolId).toBe('std:none');
    expect(readLegendText('= tu przyszyć guzik', reg)).toBeNull();
    expect(readLegendText('  ', reg)).toBeNull();
  });

  it('works out cable crossings from the working steps', () => {
    expect(
      readLegendText(cable('2 oczka', 'przodu', '2 oczka', 'prawe', 'prawo'), reg)?.symbolId,
    ).toBe('cable:2-2-lc');
    expect(
      readLegendText(cable('1 oczko', 'tyłu', '1 oczko', 'prawe', 'prawo'), reg)?.symbolId,
    ).toBe('cable:1-1-rc');
    expect(
      readLegendText(cable('1 oczko', 'tyłu', '1 oczko', 'prawe', 'lewo'), reg)?.symbolId,
    ).toBe('cable:1-1-rpc');
    expect(
      readLegendText(cable('1 oczko', 'przodu', '1 oczko', 'lewe', 'prawo'), reg)?.symbolId,
    ).toBe('cable:1-1-lpc');
    expect(
      readLegendText(cable('1 oczko', 'tyłu', '2 oczka', 'prawe', 'lewo'), reg)?.symbolId,
    ).toBe('cable:2-1-rpc');
    expect(
      readLegendText(cable('2 oczka', 'przodu', '1 oczko', 'lewe', 'prawo'), reg)?.symbolId,
    ).toBe('cable:2-1-lpc');
    // ASCII spelling (e.g. from a PDF without Polish glyphs) works too.
    expect(
      readLegendText(
        'zdjac 2 oczka na drut pomocniczy z tylu, przerobic 2 oczka prawe, 2 oczka z drutu przerobic na prawo',
        reg,
      )?.symbolId,
    ).toBe('cable:2-2-rc');
    // A crossing the library doesn't have is left to the user.
    expect(readLegendText(cable('3 oczka', 'przodu', '3 oczka', 'prawe', 'prawo'), reg)).toBeNull();
  });

  it('names crossings like the library', () => {
    expect(cableId({ held: 2, heldAt: 'back', worked: 2, workedKind: 'k', fromCnKind: 'p' })).toBe(
      'cable:2-2-rpc',
    );
    expect(cableId({ held: 1, heldAt: 'front', worked: 2, workedKind: 'p', fromCnKind: 'k' })).toBe(
      'cable:1-2-lpc',
    );
  });
});
