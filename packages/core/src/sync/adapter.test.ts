import { describe, expect, it } from 'vitest';
import { makeProject } from '../__tests__/fixtures';
import { localOnlySync, syncDocId, type SyncDoc } from './adapter';

describe('sync adapter (v1: local only)', () => {
  const project: SyncDoc = { kind: 'project', record: makeProject({ id: 'pr' }) };
  const progress: SyncDoc = {
    kind: 'progress',
    record: {
      projectId: 'x',
      patternId: 'body',
      done: 3,
      undo: [],
      redo: [],
      updatedAt: '2026-10-17T08:00:00.000Z',
    },
  };

  it('never pulls anything and accepts local pushes', async () => {
    expect(localOnlySync.status()).toEqual({ state: 'local-only' });
    expect(await localOnlySync.pull(null)).toEqual({ changes: [], cursor: { value: 'local' } });
    expect(await localOnlySync.push([project, progress])).toEqual([
      { id: 'project:pr', status: 'accepted' },
      { id: 'progress:x:body', status: 'accepted' },
    ]);
  });

  it('identifies documents across devices', () => {
    expect(syncDocId(progress)).toBe('progress:x:body');
    expect(syncDocId(project)).toBe('project:pr');
  });
});
