import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, type StorageAdapter } from '../lib/storage';
import { sampleProject } from '../sample/sampleProject';
import { resetDraftForTests, useDraft } from './draft';
import { setStorageForTests, useLibrary } from './library';
import { flushWrites, useSession } from './session';

let storage: StorageAdapter;
const NOW = '2026-10-22T10:00:00.000Z';

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
  useLibrary.setState({ status: 'idle', projects: [], progress: {}, persist: null });
  useSession.getState().close();
});

async function newProject(id = 'p1') {
  const lib = useLibrary.getState();
  await lib.load();
  return lib.addProject(sampleProject(id, 'Sweter', NOW));
}

describe('library store', () => {
  it('adds projects, newest first, and asks the browser to keep the data', async () => {
    await newProject('a');
    await useLibrary.getState().addProject({
      ...sampleProject('b', 'B', NOW),
      updatedAt: '2026-10-22T11:00:00.000Z',
    });
    expect(useLibrary.getState().projects.map((p) => p.id)).toEqual(['b', 'a']);
    expect(['persisted', 'best-effort', 'unsupported']).toContain(useLibrary.getState().persist);
  });

  it('changes projects with functional updates, in order', async () => {
    await newProject();
    const lib = useLibrary.getState();
    const [a, b] = await Promise.all([
      lib.updateProject('p1', (p) => ({ ...p, name: 'A' })),
      lib.updateProject('p1', (p) => ({ ...p, notes: `${p.name} then notes` })),
    ]);
    expect(a?.name).toBe('A');
    expect(b).toMatchObject({ name: 'A', notes: 'A then notes' });
    expect(await storage.getProject('p1')).toMatchObject({ name: 'A', notes: 'A then notes' });
    const same = useLibrary.getState().project('p1');
    expect(await lib.updateProject('p1', (p) => p)).toBe(same);
    expect(await lib.updateProject('nope', (p) => p)).toBeUndefined();
  });

  it('deletes a pattern with its progress, and projects with all progress', async () => {
    await newProject();
    for (const patternId of ['rib', 'body'])
      await storage.putProgress({
        projectId: 'p1',
        patternId,
        done: 3,
        undo: [],
        redo: [],
        updatedAt: NOW,
      });
    expect(Object.keys(await useLibrary.getState().progressOf('p1')).sort()).toEqual([
      'body',
      'rib',
    ]);
    await useLibrary.getState().deletePattern('p1', 'body');
    const project = useLibrary.getState().project('p1');
    expect(project?.patterns.map((p) => p.id)).toEqual(['rib']);
    expect(project?.activePatternId).toBe('rib');
    expect(await storage.getProgress('p1', 'body')).toBeUndefined();
    expect(useLibrary.getState().progress['p1']?.patternId).toBe('rib');

    await useLibrary.getState().deleteProject('p1');
    expect(useLibrary.getState().projects).toEqual([]);
    expect(await storage.getProject('p1')).toBeUndefined();
    expect(await storage.listProgress('p1')).toEqual([]);
  });

  it('exports and restores a backup with projects and progress', async () => {
    await newProject();
    await storage.putProgress({
      projectId: 'p1',
      patternId: 'body',
      done: 7,
      undo: [0],
      redo: [],
      updatedAt: NOW,
    });
    const text = await useLibrary.getState().exportBackup();
    const backup = JSON.parse(text) as Record<string, unknown[]>;
    expect(backup['format']).toBe('knitting-tracker/backup');
    expect(backup['patterns']).toBeUndefined();
    expect(backup['projects']).toHaveLength(1);
    expect(backup['progress']).toHaveLength(1);

    await useLibrary.getState().deleteProject('p1');
    const preview = await useLibrary.getState().previewRestore(text);
    if (!preview.ok) throw new Error('backup did not read');
    expect(preview.plan.projects.map((p) => p.action)).toEqual(['add']);
    await useLibrary.getState().applyRestore(preview.plan);
    expect(useLibrary.getState().projects.map((p) => p.id)).toEqual(['p1']);
    expect(useLibrary.getState().progress['p1']?.done).toBe(7);
    expect((await useLibrary.getState().previewRestore('nope')).ok).toBe(false);
  });
});

describe('tracker session', () => {
  it('opens the active pattern, persists every change in order and restores it', async () => {
    await newProject();
    await useSession.getState().open('p1');
    const s = useSession.getState();
    expect(s.patternId).toBe('body');
    expect(s.grid?.stitchCount).toBe(46);
    s.dispatch({ type: 'tap', index: 10, mode: 'mark' });
    useSession.getState().dispatch({ type: 'completeRow' });
    useSession.getState().dispatch({ type: 'undo' });
    await flushWrites();
    expect((await storage.getProgress('p1', 'body'))?.done).toBe(10);

    useSession.getState().close();
    await useSession.getState().open('p1');
    expect(useSession.getState().progress).toMatchObject({ done: 10, undo: [0], redo: [46] });
    expect(useLibrary.getState().progress['p1']?.done).toBe(10);
  });

  it('writes pending editor changes before building the grid', async () => {
    resetDraftForTests();
    await newProject();
    await useDraft.getState().open('p1');
    useDraft.getState().updatePattern('body', (p) => ({ ...p, name: 'Korpus zmieniony' }));
    // Opened right away, before the editor's own delayed save.
    await useSession.getState().open('p1');
    expect(useSession.getState().grid?.pattern.name).toBe('Korpus zmieniony');
  });

  it('opens another pattern and makes it the active one', async () => {
    await newProject();
    await useSession.getState().open('p1', 'rib');
    expect(useSession.getState().model?.unit).toBe('row');
    useSession.getState().dispatch({ type: 'completeRow' });
    await flushWrites();
    expect(useLibrary.getState().project('p1')?.activePatternId).toBe('rib');
    expect((await storage.getProject('p1'))?.activePatternId).toBe('rib');
    expect(useLibrary.getState().progress['p1']?.done).toBe(1);
  });

  it('marks write failures and recovers on the next successful write', async () => {
    await newProject();
    await useSession.getState().open('p1');
    const put = storage.putProgress;
    storage.putProgress = () => Promise.reject(new Error('quota'));
    useSession.getState().dispatch({ type: 'tap', index: 3, mode: 'mark' });
    await flushWrites();
    expect(useSession.getState().saveFailed).toBe(true);
    storage.putProgress = put;
    useSession.getState().dispatch({ type: 'tap', index: 4, mode: 'mark' });
    await flushWrites();
    expect(useSession.getState().saveFailed).toBe(false);
    expect((await storage.getProgress('p1', 'body'))?.done).toBe(4);
  });

  it('reports missing projects, patterns and empty projects', async () => {
    await useSession.getState().open('nope');
    expect(useSession.getState().error).toBe('not-found');
    await newProject();
    await useSession.getState().open('p1', 'nope');
    expect(useSession.getState().error).toBe('pattern-missing');
    await useLibrary.getState().addProject({ ...sampleProject('e', 'E', NOW), patterns: [] });
    const { activePatternId: _a, ...empty } = sampleProject('e2', 'E', NOW);
    await useLibrary.getState().addProject({ ...empty, patterns: [] });
    await useSession.getState().open('e2');
    expect(useSession.getState().error).toBe('no-patterns');
  });

  it('applies chart changes of the pattern', async () => {
    const base = sampleProject('k', 'Knit seed', NOW);
    await useLibrary.getState().addProject({
      ...base,
      patterns: base.patterns.map((p) =>
        p.id === 'body'
          ? {
              ...p,
              modifications: [
                {
                  kind: 'replaceChart' as const,
                  chartId: 'R',
                  chart: {
                    id: 'k',
                    name: 'k',
                    width: 1,
                    height: 1,
                    palette: { k: 'std:k' },
                    rows: ['k'],
                  },
                },
              ],
            }
          : p,
      ),
    });
    await useSession.getState().open('k');
    const grid = useSession.getState().grid;
    expect([1, 2, 3].map((st) => grid?.cellAtStitch(1, st).symbolId)).toEqual([
      'std:k',
      'std:k',
      'std:k',
    ]);
  });

  it('finishes and reopens a pattern, renames the project and sets a gauge', async () => {
    await newProject();
    await useSession.getState().open('p1');
    await useSession.getState().finishPattern(12.7);
    expect(useSession.getState().project?.finishedRows).toEqual({ body: 12 });
    await useSession
      .getState()
      .updateProject({ name: '  Nowa  ', gauge: { stitches: 20, rows: 30 } });
    expect(useSession.getState().project).toMatchObject({
      name: 'Nowa',
      knitterGauge: { stitches: 20, rows: 30 },
    });
    await useSession.getState().updateProject({ name: ' ', gauge: null });
    expect(useSession.getState().project?.name).toBe('Nowa');
    expect(useSession.getState().project?.knitterGauge).toBeUndefined();
    await useSession.getState().reopenPattern('body');
    await useSession.getState().reopenPattern('body');
    expect(useSession.getState().project?.finishedRows).toBeUndefined();
    await flushWrites();
    expect((await storage.getProject('p1'))?.name).toBe('Nowa');
  });
});
