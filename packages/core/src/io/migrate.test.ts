import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../basics';
import { resolvePattern } from '../layout/resolve';
import { validateProject } from '../validate/pattern';
import { readBackupFile, serializeBackup } from './backup';
import { readProjectFile, serializeProject } from './file';

/** Frozen files written with older schemas and never regenerated. */
const frozen = (version: 'v1' | 'v2', name: string) =>
  readFileSync(new URL(`../../../test-fixtures/files/${version}/${name}`, import.meta.url), 'utf8');

describe('migration from frozen schema v1 files', () => {
  it('opens a v1 pattern file as a project whose patterns are the former stages', () => {
    const read = readProjectFile(frozen('v1', 'pattern.ktpattern.json'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const project = read.value;
    expect(project.name).toBe('Frozen v1 cardigan');
    expect(project.designer).toBe('Test fixture');
    expect(project.patterns.map((s) => s.id)).toEqual(['body', 'back']);
    expect(project.activePatternId).toBe('body');
    // The content still resolves exactly as before.
    const body = resolvePattern(project, 'body', { sizeIndex: 1 });
    expect(body.stitchCount).toBe(24);
    expect(body.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(body.cellAtStitch(1, 7).zone.placementId).toBe('r1');
    expect(resolvePattern(project, 'back', { sizeIndex: 0 }).side(1)).toBe('WS');

    const again = JSON.parse(serializeProject(project)) as { schemaVersion: number };
    expect(again.schemaVersion).toBe(SCHEMA_VERSION);
    expect(readProjectFile(serializeProject(project))).toEqual({ ok: true, value: project });
  });

  it('opens a v1 backup with its project and progress', () => {
    const read = readBackupFile(frozen('v1', 'backup.ktbackup.json'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.skipped).toEqual([]);
    expect(read.value.projects.map((p) => p.id)).toEqual(['p-1']);
    expect(read.value.projects[0]).toMatchObject({
      name: 'My cardigan',
      sizeIndex: 1,
      activePatternId: 'body',
    });
    expect(read.value.progress[0]).toMatchObject({ projectId: 'p-1', patternId: 'body', done: 57 });
    expect(read.value.projects[0]?.finishedRows).toBeUndefined();
    const back = readBackupFile(serializeBackup(read.value));
    expect(back.ok && back.value).toMatchObject({
      projects: read.value.projects,
      progress: read.value.progress,
    });
  });
});

describe('migration from frozen schema v2 files (1.0)', () => {
  it('turns a project and its pattern into one project with patterns', () => {
    const read = readBackupFile(frozen('v2', 'backup.ktbackup.json'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.skipped).toEqual([]);
    const [vest, scarf] = read.value.projects;
    if (!vest || !scarf) throw new Error('missing projects');
    expect(vest).toMatchObject({
      id: 'p-2',
      name: 'My vest',
      revision: 4,
      sizes: ['S', 'M'],
      sizeIndex: 1,
      gauge: { stitches: 22, rows: 30 },
      knitterGauge: { stitches: 20, rows: 28 },
      activePatternId: 'front',
      finishedRows: { body: 12 },
      createdAt: '2026-10-18T10:05:00.000Z',
      updatedAt: '2026-10-20T07:59:00.000Z',
    });
    expect(vest.patterns.map((p) => [p.id, p.name, p.charts.map((c) => c.id)])).toEqual([
      // The chart no stage placed (spare) goes to the first pattern, so nothing is lost.
      ['body', 'Body', ['seed', 'rope', 'spare']],
      ['front', 'Front', ['rope']],
      ['rib', 'Rib', []],
    ]);
    const [body, front, rib] = vest.patterns;
    // The chart replacement moves to the pattern that holds the chart.
    expect(body?.modifications?.map((m) => m.chartId)).toEqual(['seed']);
    expect(front?.modifications).toBeUndefined();
    expect(front?.layout[0]).toMatchObject({
      continueFrom: { patternId: 'body', placementId: 'r1' },
    });
    expect(front?.targetCm).toEqual([10, 12]);
    expect(rib?.tracking).toBe('rows');
    expect(body?.legend).toEqual([
      { symbolId: 'cable:2-2-lc', number: 'C4', text: 'Own wording for a cross' },
    ]);

    // Same grid as before: the front continues the rope where 12 body rounds ended.
    const grid = resolvePattern(vest, 'front');
    expect(grid.zones[0]?.continued).toEqual({
      patternId: 'body',
      placementId: 'r1',
      known: true,
    });
    expect(grid.cellAtStitch(1, 1).chartRow).toBe((12 % 6) + 1);
    expect(resolvePattern(vest, 'body').cellAtStitch(1, 1).symbolId).toBe('std:k');
    expect(validateProject(vest).ok).toBe(true);

    expect(read.value.progress.map((r) => [r.projectId, r.patternId, r.done])).toEqual([
      ['p-2', 'body', 288],
      ['p-2', 'front', 9],
    ]);

    // A pattern no project used becomes a project of its own, without progress.
    expect(scarf).toMatchObject({
      id: 'loose-scarf',
      name: 'Loose scarf',
      sizes: ['one'],
      sizeIndex: 0,
      createdAt: '2026-10-18T11:00:00.000Z',
    });
    expect(scarf.patterns.map((p) => p.id)).toEqual(['stage-1']);
  });

  it('opens a v2 pattern file as a project', () => {
    const read = readProjectFile(frozen('v2', 'pattern.ktpattern.json'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toMatchObject({
      id: 'frozen-v2',
      name: 'Frozen v2 vest',
      sizeIndex: 0,
      activePatternId: 'body',
      createdAt: '2026-10-19T12:00:00.000Z',
    });
    expect(read.value.knitterGauge).toBeUndefined();
    expect(read.value.patterns).toHaveLength(3);
  });
});
