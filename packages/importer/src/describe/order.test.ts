import { describe, expect, it } from 'vitest';
import { detectPartOrder } from './order';

describe('order of the parts', () => {
  it('uses the usual order when the text says nothing about it', () => {
    expect(detectPartOrder('Sweter z warkoczami. Rękawy są długie.', 'sweater')).toEqual({
      order: ['bottom-rib', 'body', 'yoke', 'sleeve', 'sleeve-cuff', 'neck'],
      source: 'usual',
      evidence: [],
    });
  });

  it('turns to the other direction when the pattern is knitted from the top or the toe', () => {
    const top = detectPartOrder('Sweter robiony od góry, bez szwów.', 'sweater');
    expect(top.source).toBe('other-way');
    expect(top.order).toEqual(['neck', 'yoke', 'body', 'bottom-rib', 'sleeve', 'sleeve-cuff']);
    expect(top.evidence).toEqual(['od góry']);
    expect(detectPartOrder('Toe-up socks', 'socks').order[0]).toBe('toe');
    expect(detectPartOrder('Skarpety od palców', 'socks').order.at(-1)).toBe('cuff');
  });

  it('follows the headings of the description, keeping parts without one in place', () => {
    const text = [
      'SWETER JESIENNY',
      'Sweter z długim rękawem, robiony na okrągło.',
      'RĘKAWY',
      'Nabierz 48 oczek i przerabiaj ściągaczem 2/2.',
      '2. Korpus: nabierz 200 oczek na drut z żyłką.',
      'Ściągacz dekoltu',
      'Nabierz oczka wokół dekoltu.',
    ].join('\n');
    const r = detectPartOrder(text, 'sweater');
    expect(r.source).toBe('headings');
    expect(r.evidence).toEqual(['RĘKAWY', 'Korpus', 'Ściągacz dekoltu']);
    // body, sleeve and neck take the slots (2, 4, 6) in the order of their headings.
    expect(r.order).toEqual(['bottom-rib', 'sleeve', 'yoke', 'body', 'sleeve-cuff', 'neck']);
  });

  it('ignores long sentences that only mention a part, and needs two headings', () => {
    const text =
      'Pięta: robiona rzędami skróconymi.\nNa cholewce przerabiaj warkocz przez 15 cm, potem pięta.';
    expect(detectPartOrder(text, 'socks').source).toBe('usual');
    const socks = 'Czubek\nStopa\nKlin\nPięta\nCholewka\nŚciągacz';
    expect(detectPartOrder(socks, 'socks').order).toEqual([
      'toe',
      'foot',
      'gusset',
      'heel',
      'leg',
      'cuff',
    ]);
  });

  it('reads English headings and leaves kinds without headings alone', () => {
    const hat = detectPartOrder(
      'CROWN\nDecrease every other round.\nBRIM:\nKnit 2, purl 2.',
      'hat',
    );
    expect(hat.order).toEqual(['crown', 'body', 'brim']);
    expect(detectPartOrder('Szalik\nBrzeg', 'scarf').source).toBe('usual');
    expect(detectPartOrder('', 'custom')).toEqual({ order: [], source: 'usual', evidence: [] });
  });
});
