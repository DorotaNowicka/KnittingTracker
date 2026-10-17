import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, type StorageAdapter } from '../lib/storage';
import { samplePattern } from '../sample/samplePattern';
import { setStorageForTests, useLibrary } from './library';
import { flushWrites, useSession } from './session';

let storage: StorageAdapter;

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
  useLibrary.setState({ status: 'idle', patterns: [], projects: [], progress: {}, persist: null });
  useSession.getState().close();
});

async function newProject() {
  const lib = useLibrary.getState();
  await lib.load();
  const pattern = await lib.savePattern(samplePattern, 'sample');
  return lib.createProject({
    pattern,
    name: '  ',
    sizeIndex: 0,
    stageId: 'body',
    modifications: [],
  });
}

describe('library store', () => {
  it('stores patterns once, keeps both versions when ids clash, and creates projects', async () => {
    const lib = useLibrary.getState();
    await lib.load();
    const a = await lib.savePattern(samplePattern, 'sample');
    const again = await useLibrary.getState().savePattern(samplePattern, 'sample');
    expect(again).toBe(a);
    const changed = await useLibrary
      .getState()
      .savePattern({ ...samplePattern, title: 'Other' }, 'file');
    expect(changed.id).not.toBe(a.id);
    expect(changed.id.startsWith(samplePattern.id)).toBe(true);
    const project = await useLibrary.getState().createProject({
      pattern: a,
      name: '  ',
      sizeIndex: 0,
      stageId: 'body',
      modifications: [],
    });
    expect(project.name).toBe(samplePattern.title);
    expect(useLibrary.getState().projects[0]?.id).toBe(project.id);
    expect(['persisted', 'best-effort', 'unsupported']).toContain(useLibrary.getState().persist);
  });

  it('exports a backup with patterns, projects and progress', async () => {
    const project = await newProject();
    await storage.putProgress({
      projectId: project.id,
      stageId: 'body',
      done: 7,
      undo: [0],
      redo: [],
      updatedAt: project.updatedAt,
    });
    const backup = JSON.parse(await useLibrary.getState().exportBackup()) as Record<
      string,
      unknown[]
    >;
    expect(backup['format']).toBe('knitting-tracker/backup');
    expect(backup['patterns']).toHaveLength(1);
    expect(backup['projects']).toHaveLength(1);
    expect(backup['progress']).toHaveLength(1);
  });

  it('deletes projects with their progress', async () => {
    const project = await newProject();
    await useLibrary.getState().deleteProject(project.id);
    expect(useLibrary.getState().projects).toEqual([]);
    expect(await storage.getProject(project.id)).toBeUndefined();
  });
});

describe('tracker session', () => {
  it('opens a project, persists every change in order and restores it', async () => {
    const project = await newProject();
    await useSession.getState().open(project.id);
    const s = useSession.getState();
    expect(s.stage?.stitchCount).toBe(46);
    s.dispatch({ type: 'tap', index: 10, mode: 'mark' });
    useSession.getState().dispatch({ type: 'completeRow' });
    useSession.getState().dispatch({ type: 'undo' });
    await flushWrites();
    expect((await storage.getProgress(project.id, 'body'))?.done).toBe(10);

    useSession.getState().close();
    await useSession.getState().open(project.id);
    expect(useSession.getState().progress).toMatchObject({ done: 10, undo: [0], redo: [46] });
    expect(useLibrary.getState().progress[project.id]?.done).toBe(10);
  });

  it('marks write failures and recovers on the next successful write', async () => {
    const project = await newProject();
    await useSession.getState().open(project.id);
    const put = storage.putProgress;
    storage.putProgress = () => Promise.reject(new Error('quota'));
    useSession.getState().dispatch({ type: 'tap', index: 3, mode: 'mark' });
    await flushWrites();
    expect(useSession.getState().saveFailed).toBe(true);
    storage.putProgress = put;
    useSession.getState().dispatch({ type: 'tap', index: 4, mode: 'mark' });
    await flushWrites();
    expect(useSession.getState().saveFailed).toBe(false);
    expect((await storage.getProgress(project.id, 'body'))?.done).toBe(4);
  });

  it('reports missing projects and patterns', async () => {
    await useSession.getState().open('nope');
    expect(useSession.getState().error).toBe('not-found');
    const project = await newProject();
    await storage.deletePattern(project.patternId);
    await useSession.getState().open(project.id);
    expect(useSession.getState().error).toBe('pattern-missing');
  });

  it('applies project modifications', async () => {
    const lib = useLibrary.getState();
    await lib.load();
    const pattern = await lib.savePattern(samplePattern, 'sample');
    const project = await useLibrary.getState().createProject({
      pattern,
      name: 'Knit seed',
      sizeIndex: 0,
      stageId: 'body',
      modifications: [
        {
          kind: 'replaceChart',
          chartId: 'R',
          chart: { id: 'k', name: 'k', width: 1, height: 1, palette: { k: 'std:k' }, rows: ['k'] },
        },
      ],
    });
    await useSession.getState().open(project.id);
    const stage = useSession.getState().stage;
    expect([1, 2, 3].map((st) => stage?.cellAtStitch(1, st).symbolId)).toEqual([
      'std:k',
      'std:k',
      'std:k',
    ]);
  });
});
