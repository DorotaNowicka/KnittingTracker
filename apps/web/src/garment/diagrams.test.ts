import { PROJECT_KIND_INFO } from '@kt/core';
import { describe, expect, it } from 'vitest';
import { DIAGRAMS } from './diagrams';

describe('garment diagrams', () => {
  it('draw exactly the items of each kind', () => {
    for (const [kind, diagram] of Object.entries(DIAGRAMS)) {
      const items = PROJECT_KIND_INFO[kind as keyof typeof DIAGRAMS].items.map((i) => i.id);
      expect(diagram.regions.map((r) => r.id).sort(), kind).toEqual([...items].sort());
    }
  });

  it('place a number inside the drawing for every part', () => {
    for (const diagram of Object.values(DIAGRAMS)) {
      for (const r of diagram.regions) {
        expect(r.marks.length, r.id).toBeGreaterThan(0);
        for (const [x, y] of r.marks) {
          expect(x).toBeGreaterThanOrEqual(10);
          expect(x).toBeLessThanOrEqual(230);
          expect(y).toBeGreaterThanOrEqual(10);
          expect(y).toBeLessThanOrEqual(210);
        }
      }
    }
  });
});
