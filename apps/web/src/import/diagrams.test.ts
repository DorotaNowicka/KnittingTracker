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
});
