import type { Pattern, Project } from '@kt/core';

/** A pattern as stored on the device. */
export interface StoredPattern {
  readonly id: string;
  readonly pattern: Pattern;
  /** Where it came from: an imported file, the built-in sample, or built in the editor. */
  readonly source: 'file' | 'sample' | 'user';
  readonly importedAt: string;
  /** Last edit in the pattern editor. */
  readonly updatedAt?: string;
}

/** Project metadata. Progress lives in its own small records (hot writes, ADR-3). */
export type StoredProject = Omit<Project, 'progress'>;

export interface StoredProgress {
  readonly projectId: string;
  readonly stageId: string;
  readonly done: number;
  readonly undo: readonly number[];
  readonly redo: readonly number[];
  readonly updatedAt: string;
}

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
