import { describe, expect, it } from 'vitest';
import { makePattern } from '../__tests__/fixtures';
import { localOnlySync, syncDocId, type SyncDoc } from './adapter';

describe('sync adapter (v1: local only)', () => {
  const pattern: SyncDoc = {
    kind: 'pattern',
    record: {
      id: 'p',
      pattern: makePattern(),
      source: 'user',
      importedAt: '2026-10-17T08:00:00.000Z',
    },
  };
  const progress: SyncDoc = {
    kind: 'progress',
    record: {
      projectId: 'x',
      stageId: 'body',
      done: 3,
      undo: [],
      redo: [],
      updatedAt: '2026-10-17T08:00:00.000Z',
    },
  };

  it('never pulls anything and accepts local pushes', async () => {
    expect(localOnlySync.status()).toEqual({ state: 'local-only' });
    expect(await localOnlySync.pull(null)).toEqual({ changes: [], cursor: { value: 'local' } });
    expect(await localOnlySync.push([pattern, progress])).toEqual([
      { id: 'pattern:p', status: 'accepted' },
      { id: 'progress:x:body', status: 'accepted' },
    ]);
  });

  it('identifies documents across devices', () => {
    expect(syncDocId(progress)).toBe('progress:x:body');
    expect(
      syncDocId({
        kind: 'project',
        record: {
          id: 'pr',
          name: 'n',
          patternId: 'p',
          patternRevision: 1,
          sizeIndex: 0,
          activeStageId: 'body',
          modifications: [],
          createdAt: '2026-10-17T08:00:00.000Z',
          updatedAt: '2026-10-17T08:00:00.000Z',
        },
      }),
    ).toBe('project:pr');
  });
});
