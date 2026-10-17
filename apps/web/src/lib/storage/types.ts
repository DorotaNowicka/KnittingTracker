import type { StoredPatternRecord, StoredProgressRecord, StoredProjectRecord } from '@kt/core';

/**
 * Records as stored on the device. The shapes are defined (and validated) in @kt/core, so a backup
 * file and the database hold exactly the same records (ADR-3).
 *
 * - StoredPattern: a pattern with where it came from (an imported file, the built-in sample, or
 *   built in the editor) and when it was imported / last edited.
 * - StoredProject: project metadata. Progress lives in its own small records (hot writes).
 * - StoredProgress: progress of one project in one stage.
 */
export type StoredPattern = StoredPatternRecord;
export type StoredProject = StoredProjectRecord;
export type StoredProgress = StoredProgressRecord;

/**
 * Persistence boundary of the app (ADR-3). Implementations: IndexedDB (Dexie) and an in-memory
 * fallback used when IndexedDB is unavailable (private mode, blocked storage).
 */
export interface StorageAdapter {
  readonly kind: 'indexeddb' | 'memory';
  listPatterns(): Promise<StoredPattern[]>;
  getPattern(id: string): Promise<StoredPattern | undefined>;
  putPattern(p: StoredPattern): Promise<void>;
  deletePattern(id: string): Promise<void>;

  listProjects(): Promise<StoredProject[]>;
  getProject(id: string): Promise<StoredProject | undefined>;
  putProject(p: StoredProject): Promise<void>;
  /** Deletes the project and all of its progress records. */
  deleteProject(id: string): Promise<void>;

  getProgress(projectId: string, stageId: string): Promise<StoredProgress | undefined>;
  listProgress(projectId?: string): Promise<StoredProgress[]>;
  putProgress(p: StoredProgress): Promise<void>;

  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;
}
