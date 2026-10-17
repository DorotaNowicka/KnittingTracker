import { validatePattern } from '@kt/core';
import { describe, expect, it } from 'vitest';
import { samplePattern } from './samplePattern';

describe('sample pattern', () => {
  it('is valid and every cable sits on matching stitches', () => {
    const report = validatePattern(samplePattern);
    expect(report.ok).toBe(true);
    expect(report.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});
