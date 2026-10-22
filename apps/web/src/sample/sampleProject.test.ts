import { validateProject } from '@kt/core';
import { describe, expect, it } from 'vitest';
import { sampleProject } from './sampleProject';

describe('sample project', () => {
  it('is valid and every cable sits on matching stitches', () => {
    const report = validateProject(sampleProject('s', 'Przykład', '2026-10-22T10:00:00.000Z'));
    expect(report.ok).toBe(true);
    expect(report.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});
