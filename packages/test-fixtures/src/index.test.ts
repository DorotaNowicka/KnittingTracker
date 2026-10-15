import { describe, expect, it } from 'vitest';
import { seedStitch4x4 } from './index';

describe('synthetic fixtures', () => {
  it('have rectangular rows that only use palette keys', () => {
    const width = seedStitch4x4.rows[0]?.length ?? 0;
    for (const row of seedStitch4x4.rows) {
      expect(row).toHaveLength(width);
      for (const ch of row) expect(seedStitch4x4.palette).toHaveProperty(ch);
    }
  });
});
