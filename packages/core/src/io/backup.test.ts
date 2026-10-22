import { describe, expect, it } from 'vitest';
import { makeProject } from '../__tests__/fixtures';
import { FILE_FORMATS, SCHEMA_VERSION } from '../basics';
import {
  planRestore,
  readBackupFile,
  serializeBackup,
  type BackupContent,
  type StoredProjectRecord,
} from './backup';

const project = (id: string, updatedAt: string): StoredProjectRecord =>
  makeProject({ id, name: id, updatedAt });

const progress = (projectId: string, done: number) => ({
  projectId,
  patternId: 'body',
  done,
  undo: [],
  redo: [],
  updatedAt: '2026-10-02T10:00:00.000Z',
});

describe('backup files', () => {
  it('round-trips and carries the current schema version', () => {
    const content: BackupContent = {
      projects: [{ ...project('p', '2026-10-02T10:00:00.000Z'), finishedRows: { body: 12 } }],
      progress: [progress('p', 30)],
    };
    const text = serializeBackup(content, new Date('2026-10-17T08:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({
      format: FILE_FORMATS.backup,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-17T08:00:00.000Z',
    });
    expect(readBackupFile(text)).toEqual({
      ok: true,
      value: { ...content, exportedAt: '2026-10-17T08:00:00.000Z', skipped: [] },
    });
  });

  it('skips invalid records and reports them, keeping the rest', () => {
    const text = JSON.stringify({
      format: FILE_FORMATS.backup,
      schemaVersion: SCHEMA_VERSION,
      projects: [project('p', '2026-10-02T10:00:00.000Z'), { id: 'broken', name: '' }],
      progress: [progress('p', 5), { projectId: 'p', patternId: 'body', done: -1 }],
    });
    const read = readBackupFile(text);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.projects.map((p) => p.id)).toEqual(['p']);
    expect(read.value.progress).toHaveLength(1);
    expect(read.value.skipped).toHaveLength(2);
    expect(read.value.skipped[0]).toMatch(/^project 2:/);
  });

  it('rejects other files and newer versions', () => {
    expect(readBackupFile('nope').ok).toBe(false);
    expect(readBackupFile('[]').ok).toBe(false);
    expect(readBackupFile(JSON.stringify({ format: FILE_FORMATS.project })).ok).toBe(false);
    const newer = readBackupFile(
      JSON.stringify({ format: FILE_FORMATS.backup, schemaVersion: SCHEMA_VERSION + 1 }),
    );
    expect(newer.ok).toBe(false);
  });
});

describe('restore planning', () => {
  const device: BackupContent = {
    projects: [
      project('p1', '2026-10-05T10:00:00.000Z'),
      project('p2', '2026-10-01T12:00:00.000Z'),
    ],
    progress: [progress('p1', 40), progress('p2', 3)],
  };

  it('adds what is missing, updates what is newer in the backup and keeps newer device work', () => {
    const backup: BackupContent = {
      projects: [
        project('p1', '2026-10-04T10:00:00.000Z'), // device is newer
        project('p2', '2026-10-03T12:00:00.000Z'), // backup is newer
        project('p3', '2026-10-03T12:00:00.000Z'), // new
      ],
      progress: [progress('p1', 10), progress('p2', 9), progress('p3', 1)],
    };
    const plan = planRestore(device, backup);
    expect(plan.projects.map((p) => [p.record.id, p.action])).toEqual([
      ['p1', 'keep'],
      ['p2', 'update'],
      ['p3', 'add'],
    ]);
    // Progress only for projects that are written; the device's newer p1 progress is untouched.
    expect(plan.progress.map((r) => [r.projectId, r.done])).toEqual([
      ['p2', 9],
      ['p3', 1],
    ]);
    expect(planRestore(device, device).projects.map((p) => p.action)).toEqual(['same', 'same']);
  });
});
