import {
  planRestore,
  readBackupFile,
  serializeBackup,
  type Modification,
  type Pattern,
  type ReadBackup,
  type RestorePlan,
} from '@kt/core';
import { create } from 'zustand';
import { newId } from '../lib/files';
import {
  openStorage,
  requestPersistence,
  type PersistState,
  type StorageAdapter,
  type StoredPattern,
  type StoredProgress,
  type StoredProject,
} from '../lib/storage';

let storagePromise: Promise<StorageAdapter> | null = null;

/** The app-wide storage (opened once). Tests can inject an adapter with {@link setStorageForTests}. */
export function getStorage(): Promise<StorageAdapter> {
  storagePromise ??= openStorage();
  return storagePromise;
}

export function setStorageForTests(adapter: StorageAdapter): void {
  storagePromise = Promise.resolve(adapter);
}

export interface NewProjectInput {
  readonly pattern: StoredPattern;
  readonly name: string;
  readonly sizeIndex: number;
  readonly stageId: string;
  readonly modifications: readonly Modification[];
}

interface LibraryState {
  readonly status: 'idle' | 'loading' | 'ready';
  readonly storageKind: StorageAdapter['kind'] | null;
  readonly persist: PersistState | null;
  readonly patterns: readonly StoredPattern[];
  readonly projects: readonly StoredProject[];
  /** Progress of each project's active stage, for the list. */
  readonly progress: Readonly<Record<string, StoredProgress | undefined>>;
  load(): Promise<void>;
  savePattern(pattern: Pattern, source: StoredPattern['source']): Promise<StoredPattern>;
  /** Write an edited pattern (same stored id). */
  updatePattern(stored: StoredPattern): Promise<void>;
  /** Delete a pattern; refused (false) while projects use it. */
  deletePattern(id: string): Promise<boolean>;
  createProject(input: NewProjectInput): Promise<StoredProject>;
  deleteProject(id: string): Promise<void>;
  touchProject(project: StoredProject): void;
  exportBackup(): Promise<string>;
  /** Read a backup file and plan what restoring it would change (nothing is written yet). */
  previewRestore(text: string): Promise<RestorePreview>;
  /** Write a planned restore and reload the library. */
  applyRestore(plan: RestorePlan): Promise<void>;
}

export type RestorePreview =
  | { readonly ok: true; readonly backup: ReadBackup; readonly plan: RestorePlan }
  | { readonly ok: false; readonly errors: readonly string[] };

const byRecent = (a: StoredProject, b: StoredProject) => b.updatedAt.localeCompare(a.updatedAt);

/** Everything the lists show: patterns, projects (newest first) and each project's progress. */
async function readAll(storage: StorageAdapter) {
  const [patterns, projects] = await Promise.all([storage.listPatterns(), storage.listProjects()]);
  const progress: Record<string, StoredProgress | undefined> = {};
  await Promise.all(
    projects.map(async (p) => {
      progress[p.id] = await storage.getProgress(p.id, p.activeStageId).catch(() => undefined);
    }),
  );
  const persist =
    (await storage.getSetting<PersistState>('persist').catch(() => undefined)) ?? null;
  return { patterns, projects: [...projects].sort(byRecent), progress, persist };
}

export const useLibrary = create<LibraryState>((set, get) => ({
  status: 'idle',
  storageKind: null,
  persist: null,
  patterns: [],
  projects: [],
  progress: {},

  async load() {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    const storage = await getStorage();
    try {
      set({ status: 'ready', storageKind: storage.kind, ...(await readAll(storage)) });
    } catch (error) {
      console.error('[library] load failed', error);
      set({ status: 'ready', storageKind: storage.kind });
    }
  },

  async savePattern(pattern, source) {
    const storage = await getStorage();
    // Same content already stored → reuse it; same id but different content → keep both.
    const existing = get().patterns.find(
      (p) => p.pattern.id === pattern.id && JSON.stringify(p.pattern) === JSON.stringify(pattern),
    );
    if (existing) return existing;
    const taken = get().patterns.some((p) => p.id === pattern.id);
    const stored: StoredPattern = {
      id: taken ? `${pattern.id}-${newId().slice(0, 8)}` : pattern.id,
      pattern,
      source,
      importedAt: new Date().toISOString(),
    };
    await storage.putPattern(stored);
    set({ patterns: [...get().patterns, stored] });
    return stored;
  },

  async updatePattern(stored) {
    const storage = await getStorage();
    await storage.putPattern(stored);
    const exists = get().patterns.some((p) => p.id === stored.id);
    set({
      patterns: exists
        ? get().patterns.map((p) => (p.id === stored.id ? stored : p))
        : [...get().patterns, stored],
    });
  },

  async deletePattern(id) {
    if (get().projects.some((p) => p.patternId === id)) return false;
    const storage = await getStorage();
    await storage.deletePattern(id);
    set({ patterns: get().patterns.filter((p) => p.id !== id) });
    return true;
  },

  async createProject(input) {
    const storage = await getStorage();
    const now = new Date().toISOString();
    const project: StoredProject = {
      id: newId(),
      name: input.name.trim() || input.pattern.pattern.title,
      patternId: input.pattern.id,
      patternRevision: input.pattern.pattern.revision,
      sizeIndex: input.sizeIndex,
      activeStageId: input.stageId,
      modifications: [...input.modifications],
      createdAt: now,
      updatedAt: now,
    };
    await storage.putProject(project);
    set({ projects: [project, ...get().projects] });
    // First project: ask the browser to keep the data (ADR-3).
    if (get().persist !== 'persisted') {
      const persist = await requestPersistence();
      await storage.setSetting('persist', persist).catch(() => undefined);
      set({ persist });
    }
    return project;
  },

  async deleteProject(id) {
    const storage = await getStorage();
    await storage.deleteProject(id);
    const { [id]: _removed, ...progress } = get().progress;
    set({ projects: get().projects.filter((p) => p.id !== id), progress });
  },

  touchProject(project) {
    set({
      projects: [project, ...get().projects.filter((p) => p.id !== project.id)].sort(byRecent),
    });
  },

  async exportBackup() {
    const storage = await getStorage();
    const [patterns, projects, progress] = await Promise.all([
      storage.listPatterns(),
      storage.listProjects(),
      storage.listProgress(),
    ]);
    return serializeBackup({ patterns, projects, progress });
  },

  async previewRestore(text) {
    const read = readBackupFile(text);
    if (!read.ok) return read;
    const storage = await getStorage();
    const [patterns, projects, progress] = await Promise.all([
      storage.listPatterns(),
      storage.listProjects(),
      storage.listProgress(),
    ]);
    return {
      ok: true,
      backup: read.value,
      plan: planRestore({ patterns, projects, progress }, read.value),
    };
  },

  async applyRestore(plan) {
    const storage = await getStorage();
    const writes = (action: string) => action === 'add' || action === 'update';
    for (const item of plan.patterns)
      if (writes(item.action)) await storage.putPattern(item.record);
    for (const item of plan.projects)
      if (writes(item.action)) await storage.putProject(item.record);
    for (const record of plan.progress) await storage.putProgress(record);
    // Refresh in place: the page that started the restore stays mounted.
    set(await readAll(storage));
  },
}));
