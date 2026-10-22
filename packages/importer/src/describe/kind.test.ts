import { describe, expect, it } from 'vitest';
import { detectKind } from './kind';

describe('detectKind', () => {
  it('recognises the kind from Polish and English pattern texts', () => {
    const cases: [string, string][] = [
      ['SWETER Z WARKOCZAMI\nRozmiary: S - M - L. Rękawy dziergamy na okrągło.', 'sweater'],
      ['Sweter rozpinany\nListwy z dziurkami na guziki.', 'cardigan'],
      ['Kamizelka w warkocze. Wykończenie podkrojów ściągaczem.', 'vest'],
      ['Czapka z pomponem. Denko: ujmować co 2 okrążenie.', 'hat'],
      ['Szalik w paski, długość 180 cm.', 'scarf'],
      ['Komin na drutach z żyłką.', 'cowl'],
      ['Rękawiczki z jednym palcem. Klin kciuka …', 'mittens'],
      ['Skarpetki od cholewki. Pięta: wzmocniona.', 'socks'],
      ['Cabled socks, top down. Heel flap and gusset.', 'socks'],
      ['A cardigan with raglan sleeves and button bands.', 'cardigan'],
      ['Żakiet z warkoczem, listwy z guzikami.', 'cardigan'],
      ['Łapawice dla dzieci, kciuk osobno.', 'mittens'],
    ];
    for (const [text, kind] of cases) expect(detectKind(text)?.kind, text).toBe(kind);
  });

  it('weighs the title: a hat pattern that mentions a matching sweater stays a hat', () => {
    const text =
      'Czapka Ocean\nTa czapka pasuje do swetra Ocean. Denko: ujmować. Pompon z resztek.';
    expect(detectKind(text)?.kind).toBe('hat');
    expect(detectKind('Wzór warkocza A.1, A.2.', 'Sweter dla taty')?.kind).toBe('sweater');
  });

  it('reports the words it found and how clear the guess is', () => {
    const g = detectKind('Skarpetki. Pięta i cholewka.');
    expect(g?.evidence).toEqual(expect.arrayContaining(['skarpetki', 'pięta', 'cholewka']));
    expect(g?.confidence).toBe(1);
    const mixed = detectKind('Sweter i czapka w komplecie. Sweter, czapka.');
    expect(mixed?.confidence).toBeLessThan(0.5);
  });

  it('returns null when nothing points to a kind', () => {
    expect(detectKind('Schemat A.1. Rząd 1: 2 prawe, 2 lewe.')).toBeNull();
    expect(detectKind('')).toBeNull();
  });
});
