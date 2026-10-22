import type { StoredProgressRecord, StoredProjectRecord } from '@kt/core';

/**
 * Records as stored on the device. The shapes are defined (and validated) in @kt/core, so a backup
 * file and the database hold exactly the same records (ADR-3).
 *
 * - StoredProject: a project with its patterns and their charts (schema v3).
 * - StoredProgress: progress in one pattern of a project (small, written on every tap).
 */
export type StoredProject = StoredProjectRecord;
export type StoredProgress = StoredProgressRecord;

/**
 * Persistence boundary of the app (ADR-3). Implementations: IndexedDB (Dexie) and an in-memory
 * fallback used when IndexedDB is unavailable (private mode, blocked storage).
 */
export interface StorageAdapter {
  readonly kind: 'indexeddb' | 'memory';
  listProjects(): Promise<StoredProject[]>;
  getProject(id: string): Promise<StoredProject | undefined>;
  putProject(p: StoredProject): Promise<void>;
  /** Deletes the project and all of its progress records. */
  deleteProject(id: string): Promise<void>;

  getProgress(projectId: string, patternId: string): Promise<StoredProgress | undefined>;
  listProgress(projectId?: string): Promise<StoredProgress[]>;
  putProgress(p: StoredProgress): Promise<void>;
  deleteProgress(projectId: string, patternId: string): Promise<void>;

  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;
}
