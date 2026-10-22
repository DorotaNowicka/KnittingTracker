import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import frozenV2Text from '../../../../../packages/test-fixtures/files/v2/backup.ktbackup.json?raw';
import { sampleProject } from '../../sample/sampleProject';
import { createIdbStorage } from './idb';
import { createMemoryStorage } from './memory';
import type { StorageAdapter, StoredProject } from './types';

const NOW = '2026-10-16T08:00:00.000Z';
const project: StoredProject = sampleProject('p1', 'Test', NOW);

async function exercise(storage: StorageAdapter) {
  await storage.putProject(project);
  await storage.putProgress({
    projectId: 'p1',
    patternId: 'body',
    done: 12,
    undo: [0, 5],
    redo: [],
    updatedAt: NOW,
  });
  await storage.putProgress({
    projectId: 'p1',
    patternId: 'rib',
    done: 3,
    undo: [],
    redo: [],
    updatedAt: NOW,
  });
  await storage.setSetting('persist', 'persisted');

  expect((await storage.listProjects()).map((p) => p.id)).toEqual(['p1']);
  expect(await storage.getProject('p1')).toEqual(project);
  expect((await storage.getProgress('p1', 'body'))?.done).toBe(12);
  expect(await storage.listProgress('p1')).toHaveLength(2);
  expect(await storage.listProgress()).toHaveLength(2);
  expect(await storage.getSetting('persist')).toBe('persisted');

  await storage.deleteProgress('p1', 'rib');
  expect(await storage.getProgress('p1', 'rib')).toBeUndefined();
  await storage.deleteProject('p1');
  expect(await storage.getProject('p1')).toBeUndefined();
  expect(await storage.listProgress('p1')).toEqual([]);
}

describe('storage adapters', () => {
  it('memory adapter stores and deletes in cascade', async () => {
    await exercise(createMemoryStorage());
  });

  it('IndexedDB adapter stores and deletes in cascade', async () => {
    await exercise(await createIdbStorage(`kt-test-${Math.random()}`));
  });

  it('IndexedDB adapter skips records that no longer validate', async () => {
    const s = await createIdbStorage(`kt-test-${Math.random()}`);
    await s.putProject({ ...project, sizeIndex: -1 });
    expect(await s.listProjects()).toEqual([]);
    expect(await s.getProject('p1')).toBeUndefined();
  });
});

/** The frozen 1.0 backup: its records are exactly what a 1.0 database held. */
const frozenV2 = JSON.parse(frozenV2Text) as {
  patterns: unknown[];
  projects: unknown[];
  progress: unknown[];
};

describe('database upgrade from 1.0', () => {
  it('converts patterns, projects and progress per stage into projects with patterns', async () => {
    const name = `kt-upgrade-${Math.random()}`;
    // A database as app 1.0 left it.
    const old = new Dexie(name);
    old.version(1).stores({
      patterns: 'id',
      projects: 'id, patternId, updatedAt',
      progress: '[projectId+stageId], projectId',
      settings: 'key',
    });
    await old.open();
    await old.table('patterns').bulkPut(frozenV2.patterns);
    await old.table('projects').bulkPut(frozenV2.projects);
    await old.table('progress').bulkPut(frozenV2.progress);
    await old.table('settings').put({ key: 'persist', value: 'persisted' });
    old.close();

    const s = await createIdbStorage(name);
    const projects = await s.listProjects();
    expect(projects.map((p) => p.id).sort()).toEqual(['loose-scarf', 'p-2']);
    const vest = await s.getProject('p-2');
    expect(vest?.patterns.map((p) => p.id)).toEqual(['body', 'front', 'rib']);
    expect(vest?.activePatternId).toBe('front');
    expect((await s.getProgress('p-2', 'body'))?.done).toBe(288);
    expect((await s.getProgress('p-2', 'front'))?.done).toBe(9);
    expect(await s.getSetting('persist')).toBe('persisted');

    // The old tables are gone.
    const check = new Dexie(name);
    await check.open();
    expect(check.tables.map((t) => t.name).sort()).toEqual(['progress3', 'projects3', 'settings']);
    check.close();
  });

  it('opens an empty 1.0 database without errors', async () => {
    const name = `kt-upgrade-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ patterns: 'id', projects: 'id', progress: '[projectId+stageId]' });
    await old.open();
    old.close();
    expect(await (await createIdbStorage(name)).listProjects()).toEqual([]);
  });
});
