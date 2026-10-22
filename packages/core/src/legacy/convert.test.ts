import { describe, expect, it } from 'vitest';
import { migrateBackupDoc, migratePatternFileDoc } from './convert';

const legacyPattern = (id: string) => ({
  id,
  revision: 1,
  title: `Pattern ${id}`,
  sizes: ['one'],
  symbols: [],
  legend: [],
  charts: [],
  stages: [
    {
      id: 'stage-1',
      name: 'Stage',
      construction: 'round',
      firstRowSide: 'RS',
      layout: [{ kind: 'marker', id: 'start' }],
    },
  ],
});

describe('schema v2 → v3 conversion', () => {
  it('leaves pattern files it cannot read for the reader to report', () => {
    const doc = { format: 'knitting-tracker/pattern', pattern: { id: 'x' } };
    expect(migratePatternFileDoc(doc)).toBe(doc);
  });

  it('keeps unreadable backup records so they are reported as skipped', () => {
    const out = migrateBackupDoc({
      patterns: [{ id: 'a', pattern: legacyPattern('a'), importedAt: 'not a date' }, 'junk'],
      projects: [{ id: 'broken' }, { id: 'lost', patternId: 'nowhere' }],
      progress: ['junk', { projectId: 'p', stageId: 's', done: 1 }],
    });
    expect(out['patterns']).toBeUndefined();
    const projects = out['projects'] as Record<string, unknown>[];
    expect(projects.slice(0, 2)).toEqual([{ id: 'broken' }, { id: 'lost', patternId: 'nowhere' }]);
    // The unused pattern became a project; an unreadable date falls back to a fixed time.
    expect(projects[2]).toMatchObject({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(out['progress']).toEqual(['junk', { projectId: 'p', patternId: 's', done: 1 }]);
  });

  it('gives an unused pattern a project id that does not clash', () => {
    const project = {
      id: 'a',
      name: 'Uses b',
      patternId: 'b',
      patternRevision: 1,
      sizeIndex: 3,
      activeStageId: 'gone',
      modifications: [],
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    };
    const out = migrateBackupDoc({
      patterns: [
        { id: 'a', pattern: legacyPattern('a'), importedAt: '2026-10-01T10:00:00.000Z' },
        { id: 'b', pattern: legacyPattern('b'), importedAt: '2026-10-01T10:00:00.000Z' },
      ],
      projects: [project],
    });
    const projects = out['projects'] as Record<string, unknown>[];
    expect(projects.map((p) => p['id'])).toEqual(['a', 'a-2']);
    // An out-of-range size or unknown active stage falls back to the first one.
    expect(projects[0]).toMatchObject({ sizeIndex: 0, activePatternId: 'stage-1' });
    expect(out['progress']).toEqual([]);
  });
});
