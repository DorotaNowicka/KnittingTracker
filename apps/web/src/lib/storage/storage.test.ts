import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { samplePattern } from '../../sample/samplePattern';
import { createIdbStorage } from './idb';
import { createMemoryStorage } from './memory';
import type { StorageAdapter, StoredProject } from './types';

const project: StoredProject = {
  id: 'p1',
  name: 'Test',
  patternId: samplePattern.id,
  patternRevision: 1,
  sizeIndex: 0,
  activeStageId: 'body',
  modifications: [],
  createdAt: '2026-10-16T08:00:00.000Z',
  updatedAt: '2026-10-16T08:00:00.000Z',
};

async function exercise(storage: StorageAdapter) {
  await storage.putPattern({
    id: samplePattern.id,
    pattern: samplePattern,
    source: 'sample',
    importedAt: project.createdAt,
  });
  await storage.putProject(project);
  await storage.putProgress({
    projectId: 'p1',
    stageId: 'body',
    done: 12,
    undo: [0, 5],
    redo: [],
    updatedAt: project.updatedAt,
  });
  await storage.putProgress({
    projectId: 'p1',
    stageId: 'other',
    done: 3,
    undo: [],
    redo: [],
    updatedAt: project.updatedAt,
  });
  await storage.setSetting('persist', 'persisted');

  expect((await storage.listPatterns()).map((p) => p.id)).toEqual([samplePattern.id]);
  expect(await storage.getProject('p1')).toEqual(project);
  expect((await storage.getProgress('p1', 'body'))?.done).toBe(12);
  expect(await storage.listProgress('p1')).toHaveLength(2);
  expect(await storage.getSetting('persist')).toBe('persisted');

  await storage.deleteProject('p1');
  expect(await storage.getProject('p1')).toBeUndefined();
  expect(await storage.listProgress('p1')).toEqual([]);
  expect(await storage.getPattern(samplePattern.id)).toBeDefined();
  await storage.deletePattern(samplePattern.id);
  expect(await storage.listPatterns()).toEqual([]);
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
    await s.putPattern({
      id: 'bad',
      pattern: { ...samplePattern, stages: [] },
      source: 'file',
      importedAt: project.createdAt,
    });
    await s.putProject({ ...project, sizeIndex: -1 });
    expect(await s.listPatterns()).toEqual([]);
    expect(await s.getPattern('bad')).toBeUndefined();
    expect(await s.listProjects()).toEqual([]);
    expect(await s.getProject('p1')).toBeUndefined();
  });
});
