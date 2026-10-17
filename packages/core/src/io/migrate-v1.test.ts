import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../basics';
import { resolveStage } from '../layout/resolve';
import { readBackupFile, serializeBackup } from './backup';
import { readPatternFile, serializePattern } from './file';

/** Frozen files written with schema v1 (M4) and never regenerated. */
const frozen = (name: string) =>
  readFileSync(new URL(`../../../test-fixtures/files/v1/${name}`, import.meta.url), 'utf8');

describe('migration from frozen schema v1 files', () => {
  it('opens a v1 pattern file and saves it as the current version unchanged', () => {
    const read = readPatternFile(frozen('pattern.ktpattern.json'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const pattern = read.value;
    expect(pattern.title).toBe('Frozen v1 cardigan');
    expect(pattern.stages.map((s) => s.id)).toEqual(['body', 'back']);
    // The content still resolves exactly as before.
    const body = resolveStage(pattern, 'body', 1);
    expect(body.stitchCount).toBe(24);
    expect(body.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(body.cellAtStitch(1, 7).zone.placementId).toBe('r1');
    expect(resolveStage(pattern, 'back', 0).side(1)).toBe('WS');

    const again = JSON.parse(serializePattern(pattern)) as { schemaVersion: number };
    expect(again.schemaVersion).toBe(SCHEMA_VERSION);
    expect(readPatternFile(serializePattern(pattern))).toEqual({ ok: true, value: pattern });
  });

  it('opens a v1 backup with its project and progress', () => {
    const read = readBackupFile(frozen('backup.ktbackup.json'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.skipped).toEqual([]);
    expect(read.value.patterns.map((p) => p.id)).toEqual(['frozen-v1']);
    expect(read.value.projects[0]).toMatchObject({
      id: 'p-1',
      sizeIndex: 1,
      activeStageId: 'body',
    });
    expect(read.value.progress[0]).toMatchObject({ projectId: 'p-1', stageId: 'body', done: 57 });
    // v2 fields are simply absent.
    expect(read.value.projects[0]?.finishedRows).toBeUndefined();
    const back = readBackupFile(serializeBackup(read.value));
    expect(back.ok && back.value.progress).toEqual(read.value.progress);
  });
});
