import { addChart, blankPattern } from '@kt/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRoute, paths } from '../lib/router';
import { createMemoryStorage, type StorageAdapter } from '../lib/storage';
import { SAVE_DELAY_MS, resetDraftForTests, useDraft } from './draft';
import { setStorageForTests, useLibrary } from './library';

let storage: StorageAdapter;

const stored = () => ({
  id: 'p1',
  pattern: blankPattern({ id: 'p1', title: 'Test', sizes: ['S'], stageName: 'Korpus' }),
  source: 'user' as const,
  importedAt: '2026-10-16T10:00:00.000Z',
});

beforeEach(async () => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
  useLibrary.setState({ status: 'idle', patterns: [], projects: [], progress: {}, persist: null });
  resetDraftForTests();
  await useLibrary.getState().updatePattern(stored());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('draft store', () => {
  it('opens a pattern, bumps the revision once and saves after a pause', async () => {
    vi.useFakeTimers();
    await useDraft.getState().open('p1');
    expect(useDraft.getState().status).toBe('ready');
    useDraft.getState().update((p) => ({ ...p, title: 'A' }));
    useDraft.getState().update((p) => ({ ...p, title: 'B' }));
    expect(useDraft.getState().pattern?.revision).toBe(2);
    expect(useDraft.getState().dirty).toBe(true);
    expect((await storage.getPattern('p1'))?.pattern.title).toBe('Test');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(useDraft.getState().dirty).toBe(false);
    const saved = await storage.getPattern('p1');
    expect(saved?.pattern).toMatchObject({ title: 'B', revision: 2 });
    expect(saved?.updatedAt).toBeDefined();
    expect(useLibrary.getState().patterns[0]?.pattern.title).toBe('B');
  });

  it('ignores no-op changes and refuses to save a pattern that fails the schema', async () => {
    await useDraft.getState().open('p1');
    useDraft.getState().update((p) => p);
    expect(useDraft.getState().dirty).toBe(false);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useDraft.getState().update((p) => ({ ...p, title: '' }));
    await useDraft.getState().flush();
    expect(useDraft.getState().saveError).toBe(true);
    expect((await storage.getPattern('p1'))?.pattern.title).toBe('Test');
    errors.mockRestore();
  });

  it('reports a missing pattern and keeps an open draft when reopened', async () => {
    await useDraft.getState().open('nope');
    expect(useDraft.getState().status).toBe('missing');
    await useDraft.getState().open('p1');
    useDraft.getState().update((p) => addChart(p, 'A', 2, 2).pattern);
    await useDraft.getState().open('p1');
    expect(useDraft.getState().pattern?.charts).toHaveLength(1);
    // Opening another pattern writes pending edits first.
    await useDraft.getState().open('nope');
    expect((await storage.getPattern('p1'))?.pattern.charts).toHaveLength(1);
  });

  it('deletes only patterns without projects', async () => {
    useLibrary.setState({
      projects: [
        {
          id: 'x',
          name: 'x',
          patternId: 'p1',
          patternRevision: 1,
          sizeIndex: 0,
          activeStageId: 'stage-1',
          modifications: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    expect(await useLibrary.getState().deletePattern('p1')).toBe(false);
    useLibrary.setState({ projects: [] });
    expect(await useLibrary.getState().deletePattern('p1')).toBe(true);
    expect(await storage.getPattern('p1')).toBeUndefined();
  });
});

describe('routes', () => {
  it('round-trips the editor paths', () => {
    expect(parseRoute(paths.patterns())).toEqual({ name: 'patterns' });
    expect(parseRoute(paths.pattern('a b'))).toEqual({ name: 'pattern', id: 'a b' });
    expect(parseRoute(paths.patternProject('p'))).toEqual({ name: 'patternProject', id: 'p' });
    expect(parseRoute(paths.chart('p', 'a-1'))).toEqual({ name: 'chart', id: 'p', chartId: 'a-1' });
    expect(parseRoute(paths.stage('p', 's'))).toEqual({ name: 'stage', id: 'p', stageId: 's' });
    expect(parseRoute('/wzor/p/schemat')).toEqual({ name: 'notFound' });
    expect(parseRoute('/wzor/p/inne/x')).toEqual({ name: 'notFound' });
    expect(parseRoute('/wzor/%E0%A4%A')).toEqual({ name: 'notFound' });
    expect(parseRoute('/projekt/%E0%A4%A')).toEqual({ name: 'notFound' });
  });
});
