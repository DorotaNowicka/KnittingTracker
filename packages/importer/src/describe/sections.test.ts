import { describe, expect, it } from 'vitest';
import { descriptionBlocks } from './sections';

const SWEATER = `Sweter z warkoczem
ROZMIARY: S - M - L
MATERIAŁY:
Włóczka DROPS Air, 300-350-400 g.
PRÓBKA:
18 oczek x 24 rzędy = 10 x 10 cm.
TYŁ:
Nabrać 90-98-106 oczek i przerabiać ściągaczem 5 cm.
Dalej dżersejem do wys. 40-42-44 cm.
PRZÓD:
Jak tył, z warkoczem B.1 na środku.
RĘKAWY
Nabrać 44 oczka, przerabiać do wys. 45 cm.
KIESZEŃ:
Nabrać 20 oczek i przerobić 12 cm.
WYKOŃCZENIE:
Zszyć ramiona.
DEKOLT:
Nabrać 80 oczek ściągaczem.`;

describe('description blocks', () => {
  it('cuts a sweater description at its headings: parts, general sections and unknown ones', () => {
    const blocks = descriptionBlocks(SWEATER, 'sweater');
    expect(blocks.map((b) => [b.type, b.partId, b.heading])).toEqual([
      ['intro', null, ''],
      ['general', null, 'ROZMIARY: S - M - L'],
      ['general', null, 'MATERIAŁY:'],
      ['general', null, 'PRÓBKA:'],
      ['part', 'back', 'TYŁ:'],
      ['part', 'front', 'PRZÓD:'],
      ['part', 'sleeve', 'RĘKAWY'],
      ['unknown', null, 'KIESZEŃ:'],
      ['general', null, 'WYKOŃCZENIE:'],
      ['part', 'neck', 'DEKOLT:'],
    ]);
    expect(blocks[0]?.text).toBe('Sweter z warkoczem');
    expect(blocks[4]?.text).toBe(
      'Nabrać 90-98-106 oczek i przerabiać ściągaczem 5 cm.\nDalej dżersejem do wys. 40-42-44 cm.',
    );
  });

  it('a finishing heading that names a part goes to that part', () => {
    const blocks = descriptionBlocks('Wykończenie dekoltu:\nNabrać oczka.', 'sweater');
    expect(blocks).toEqual([
      { type: 'part', partId: 'neck', heading: 'Wykończenie dekoltu:', text: 'Nabrać oczka.' },
    ]);
  });

  it('a kind with a single described part takes every block that is not general', () => {
    const blocks = descriptionBlocks('Szal\nPRÓBKA:\n20 oczek\nWZÓR:\nCały czas B.1.', 'custom');
    expect(blocks.map((b) => [b.type, b.partId])).toEqual([
      ['part', 'main'],
      ['general', null],
      ['part', 'main'],
    ]);
  });

  it('ordinary sentences are not headings', () => {
    const blocks = descriptionBlocks(
      'Przerabiać: B.1 ponad 4-6 oczkami, B.2, B.1 ponad 6-8 oczkami.\nRazem = 18-22 oczek.',
      'sweater',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('intro');
  });
});
