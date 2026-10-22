import type { StoredProgressRecord, StoredProjectRecord } from '../io/backup';

/**
 * Synchronization boundary (ADR-4, FR-19). Version 1 is local only: the app talks to a
 * `SyncAdapter`, and the only implementation is {@link localOnlySync}; moving data between devices
 * is done with backup files. A real adapter (own end-to-end encrypted API, or the user's own cloud
 * storage) plugs in here when the app goes online, without changing the rest of the app.
 */

/** Everything that can travel between devices: the same records the database and backups hold. */
export type SyncDoc =
  | { readonly kind: 'project'; readonly record: StoredProjectRecord }
  | { readonly kind: 'progress'; readonly record: StoredProgressRecord };

/** Stable identity of a document across devices. */
export function syncDocId(doc: SyncDoc): string {
  switch (doc.kind) {
    case 'project':
      return `project:${doc.record.id}`;
    case 'progress':
      return `progress:${doc.record.projectId}:${doc.record.patternId}`;
  }
}

/** Opaque position in the remote change feed. */
export interface SyncCursor {
  readonly value: string;
}

export type PushOutcome =
  | { readonly id: string; readonly status: 'accepted' }
  /** The remote copy changed in between: the UI lets the knitter choose (ADR-4 conflict model). */
  | { readonly id: string; readonly status: 'conflict'; readonly remote: SyncDoc };

export type SyncStatus =
  | { readonly state: 'local-only' }
  | {
      readonly state: 'idle' | 'syncing' | 'offline' | 'error';
      readonly lastSyncAt?: string;
      readonly message?: string;
    };

export interface SyncAdapter {
  /** Short id for settings and diagnostics, e.g. "local-only". */
  readonly id: string;
  status(): SyncStatus;
  /** Changes made elsewhere since `since` (null = everything). */
  pull(since: SyncCursor | null): Promise<{ changes: SyncDoc[]; cursor: SyncCursor }>;
  /** Send local changes; each one is accepted or reported as a conflict. */
  push(changes: readonly SyncDoc[]): Promise<readonly PushOutcome[]>;
}

/**
 * Version 1: nothing leaves the device. Pull returns nothing; push accepts everything locally
 * (there is no remote to disagree with). Devices exchange data through backup files.
 */
export const localOnlySync: SyncAdapter = {
  id: 'local-only',
  status: () => ({ state: 'local-only' }),
  pull: () => Promise.resolve({ changes: [], cursor: { value: 'local' } }),
  push: (changes) =>
    Promise.resolve(changes.map((doc) => ({ id: syncDocId(doc), status: 'accepted' as const }))),
};
