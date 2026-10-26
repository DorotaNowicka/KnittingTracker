import { describe, expect, it } from 'vitest';
import { detectBodyPieces, lengthOf, partLengths } from './lengths';

const sweater = `SWETER JESIENNY
ROZMIARY: S - M - L
Próbka: 22 oczka x 30 rzędów = 10 x 10 cm.
KORPUS
Nabrać 200-220-240 oczek. Przerabiać wzorem do wys. 34-36-38 cm, licząc od brzegu.
RĘKAWY
Nabrać 48-52-56 oczek i przerabiać ok. 45 cm.
`;

describe('lengths in a pattern text', () => {
  it('reads each part’s length per size from its section, skipping the swatch', () => {
    const lengths = partLengths(sweater, 3);
    expect(lengths['body']).toEqual({
      cm: [34, 36, 38],
      evidence: 'Przerabiać wzorem do wys. 34-36-38 cm',
    });
    expect(lengths['sleeve']?.cm).toEqual([45]);
    expect(lengthOf(lengths, 'body', 1)).toEqual({
      cm: 36,
      evidence: 'Przerabiać wzorem do wys. 34-36-38 cm',
    });
    // One value for every size.
    expect(lengthOf(lengths, 'sleeve', 2)?.cm).toBe(45);
    expect(lengthOf(lengths, 'neck', 0)).toBeNull();
  });

  it('finds a body made as a back and a front, whose pieces share the body’s length if they have none', () => {
    const pieces = `TYŁ\nNabrać 100 oczek, przerabiać do wys. 40,5 cm.\nPRZÓD\nJak tył.\nRękawy: ok. 44 cm.`;
    expect(detectBodyPieces(pieces)).toEqual({ pieces: true, evidence: ['TYŁ', 'PRZÓD'] });
    const lengths = partLengths(pieces, 1);
    expect(lengthOf(lengths, 'back', 0)?.cm).toBe(40.5);
    expect(lengthOf(lengths, 'front', 0)).toBeNull();
    expect(lengthOf(lengths, 'sleeve', 0)?.cm).toBe(44);
    expect(lengthOf({ body: { cm: [30], evidence: '' } }, 'front', 0)?.cm).toBe(30);
    expect(detectBodyPieces(sweater).pieces).toBe(false);
  });
});
