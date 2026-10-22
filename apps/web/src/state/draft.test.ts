import { addChart, blankProject } from '@kt/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRoute, paths } from '../lib/router';
import { createMemoryStorage, type StorageAdapter } from '../lib/storage';
import { SAVE_DELAY_MS, resetDraftForTests, useDraft } from './draft';
import { setStorageForTests, useLibrary } from './library';

let storage: StorageAdapter;

const project = () =>
  blankProject({
    id: 'p1',
    name: 'Test',
    sizes: ['S'],
    patternName: 'Korpus',
    now: '2026-10-16T10:00:00.000Z',
  });

beforeEach(async () => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
  useLibrary.setState({ status: 'idle', projects: [], progress: {}, persist: null });
  resetDraftForTests();
  await useLibrary.getState().addProject(project());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('draft store', () => {
  it('opens a project, bumps the revision once and saves after a pause', async () => {
    vi.useFakeTimers();
    await useDraft.getState().open('p1');
    expect(useDraft.getState().status).toBe('ready');
    useDraft.getState().update((p) => ({ ...p, name: 'A' }));
    useDraft.getState().update((p) => ({ ...p, name: 'B' }));
    expect(useDraft.getState().project?.revision).toBe(2);
    expect(useDraft.getState().dirty).toBe(true);
    expect((await storage.getProject('p1'))?.name).toBe('Test');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(useDraft.getState().dirty).toBe(false);
    const saved = await storage.getProject('p1');
    expect(saved).toMatchObject({ name: 'B', revision: 2 });
    expect(saved?.updatedAt).not.toBe('2026-10-16T10:00:00.000Z');
    expect(useLibrary.getState().project('p1')?.name).toBe('B');
  });

  it('changes one pattern of the project', async () => {
    await useDraft.getState().open('p1');
    useDraft.getState().updatePattern('pattern-1', (p) => addChart(p, 'A', 2, 2).pattern);
    await useDraft.getState().flush();
    expect((await storage.getProject('p1'))?.patterns[0]?.charts).toHaveLength(1);
  });

  it('never overwrites what the tracker changed meanwhile', async () => {
    await useDraft.getState().open('p1');
    useDraft.getState().update((p) => ({ ...p, notes: 'from the editor' }));
    // The tracker finishes a pattern while the editor has unsaved edits.
    await useLibrary
      .getState()
      .updateProject('p1', (p) => ({ ...p, finishedRows: { 'pattern-1': 4 } }));
    await useDraft.getState().flush();
    expect(await storage.getProject('p1')).toMatchObject({
      notes: 'from the editor',
      finishedRows: { 'pattern-1': 4 },
    });
    // A field the draft removed is removed in the merged copy too.
    useDraft.getState().update(({ notes: _n, ...p }) => p);
    await useDraft.getState().flush();
    expect((await storage.getProject('p1'))?.notes).toBeUndefined();
  });

  it('keeps edits made while a write is running', async () => {
    await useDraft.getState().open('p1');
    const put = storage.putProject.bind(storage);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    storage.putProject = async (p) => {
      await gate;
      return put(p);
    };
    useDraft.getState().update((p) => ({ ...p, name: 'One' }));
    const first = useDraft.getState().flush();
    await vi.waitFor(() => expect(useLibrary.getState().project('p1')?.name).toBe('One'));
    useDraft.getState().update((p) => ({ ...p, notes: 'Two' }));
    release();
    await first;
    expect(useDraft.getState().dirty).toBe(true);
    await useDraft.getState().flush();
    expect(await storage.getProject('p1')).toMatchObject({ name: 'One', notes: 'Two' });
    expect(useDraft.getState().dirty).toBe(false);
  });

  it('ignores no-op changes and refuses to save a project that fails the schema', async () => {
    await useDraft.getState().open('p1');
    useDraft.getState().update((p) => p);
    expect(useDraft.getState().dirty).toBe(false);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useDraft.getState().update((p) => ({ ...p, name: '' }));
    await useDraft.getState().flush();
    expect(useDraft.getState().saveError).toBe(true);
    expect((await storage.getProject('p1'))?.name).toBe('Test');
    errors.mockRestore();
  });

  it('reports a missing project and keeps an open draft when reopened', async () => {
    await useDraft.getState().open('nope');
    expect(useDraft.getState().status).toBe('missing');
    await useDraft.getState().open('p1');
    useDraft.getState().updatePattern('pattern-1', (p) => addChart(p, 'A', 2, 2).pattern);
    await useDraft.getState().open('p1');
    expect(useDraft.getState().project?.patterns[0]?.charts).toHaveLength(1);
    // Opening another project writes pending edits first.
    await useDraft.getState().open('nope');
    expect((await storage.getProject('p1'))?.patterns[0]?.charts).toHaveLength(1);
  });

  it('refreshes a clean draft from the library when reopened', async () => {
    await useDraft.getState().open('p1');
    await useLibrary.getState().updateProject('p1', (p) => ({ ...p, name: 'Renamed' }));
    await useDraft.getState().open('p1');
    expect(useDraft.getState().project?.name).toBe('Renamed');
  });
});

describe('routes', () => {
  it('round-trips the project, pattern and chart paths', () => {
    expect(parseRoute(paths.project('a b'))).toEqual({ name: 'project', id: 'a b' });
    expect(parseRoute(paths.tracker('p', 'w 1'))).toEqual({
      name: 'tracker',
      id: 'p',
      patternId: 'w 1',
    });
    expect(parseRoute(paths.pattern('p', 'w'))).toEqual({
      name: 'pattern',
      id: 'p',
      patternId: 'w',
    });
    expect(parseRoute(paths.chart('p', 'w', 'a-1'))).toEqual({
      name: 'chart',
      id: 'p',
      patternId: 'w',
      chartId: 'a-1',
    });
    expect(parseRoute(paths.import())).toEqual({ name: 'import' });
    expect(parseRoute(paths.import('p'))).toEqual({ name: 'import', id: 'p' });
    expect(parseRoute('/projekt/p/wzor')).toEqual({ name: 'notFound' });
    expect(parseRoute('/projekt/p/wzor/w/schemat')).toEqual({ name: 'notFound' });
    expect(parseRoute('/projekt/p/wzor/w/inne')).toEqual({ name: 'notFound' });
    expect(parseRoute('/projekt/p/wzor/%E0%A4%A')).toEqual({ name: 'notFound' });
    expect(parseRoute('/wzory')).toEqual({ name: 'notFound' });
    expect(parseRoute('/projekt/%E0%A4%A')).toEqual({ name: 'notFound' });
  });
});
