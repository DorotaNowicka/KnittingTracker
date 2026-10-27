import {
  planRestore,
  readBackupFile,
  removePattern,
  serializeBackup,
  type Project,
  type ReadBackup,
  type RestorePlan,
} from '@kt/core';
import { create } from 'zustand';
import {
  openStorage,
  requestPersistence,
  type PersistState,
  type StorageAdapter,
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

/**
 * Projects on this device (schema v3: each project holds its patterns and their charts), plus the
 * progress of each project's active pattern for the lists. Every change to a project goes through
 * {@link LibraryState.updateProject}, a functional update of the latest copy, so the tracker and
 * the editor never overwrite each other's changes with a stale copy.
 */
interface LibraryState {
  readonly status: 'idle' | 'loading' | 'ready';
  readonly storageKind: StorageAdapter['kind'] | null;
  readonly persist: PersistState | null;
  /** Newest first. */
  readonly projects: readonly StoredProject[];
  /** Progress of each project's active pattern, by project id. */
  readonly progress: Readonly<Record<string, StoredProgress | undefined>>;
  load(): Promise<void>;
  project(id: string): StoredProject | undefined;
  /** Store a new project (its id must be new). */
  addProject(project: Project): Promise<StoredProject>;
  /**
   * Change a project: `change` gets the latest copy and returns the next one (or the same object
   * for no change). Resolves to the stored project, or undefined when it does not exist.
   */
  updateProject(
    id: string,
    change: (project: StoredProject) => StoredProject,
  ): Promise<StoredProject | undefined>;
  /** Remove one pattern of a project, with its progress. */
  deletePattern(projectId: string, patternId: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /**
   * Knit a project again: every pattern's progress and finish are cleared and it starts with its
   * first pattern. The patterns themselves stay as they are.
   */
  restartProject(id: string): Promise<void>;
  /** Progress of every pattern of a project, by pattern id. */
  progressOf(projectId: string): Promise<Record<string, StoredProgress>>;
  /** Record progress of the active pattern for the lists (the tracker writes it to storage). */
  noteProgress(record: StoredProgress): void;
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

async function activeProgress(storage: StorageAdapter, projects: readonly StoredProject[]) {
  const progress: Record<string, StoredProgress | undefined> = {};
  await Promise.all(
    projects.map(async (p) => {
      progress[p.id] = p.activePatternId
        ? await storage.getProgress(p.id, p.activePatternId).catch(() => undefined)
        : undefined;
    }),
  );
  return progress;
}

/** Everything the lists show: projects (newest first) and each project's progress. */
async function readAll(storage: StorageAdapter) {
  const projects = [...(await storage.listProjects())].sort(byRecent);
  const progress = await activeProgress(storage, projects);
  const persist =
    (await storage.getSetting<PersistState>('persist').catch(() => undefined)) ?? null;
  return { projects, progress, persist };
}

/** Writes to one project are chained, so they reach storage in the order they were made. */
const projectWrites = new Map<string, Promise<unknown>>();
function queueWrite(id: string, write: () => Promise<void>): Promise<void> {
  const next = (projectWrites.get(id) ?? Promise.resolve()).then(write, write);
  projectWrites.set(id, next);
  return next;
}

/** Wait until every queued project write is stored. */
export const flushProjectWrites = (): Promise<unknown> =>
  Promise.all([...projectWrites.values()].map((w) => w.catch(() => undefined)));

export const useLibrary = create<LibraryState>((set, get) => ({
  status: 'idle',
  storageKind: null,
  persist: null,
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

  project(id) {
    return get().projects.find((p) => p.id === id);
  },

  async addProject(project) {
    const storage = await getStorage();
    await storage.putProject(project);
    set({ projects: [project, ...get().projects.filter((p) => p.id !== project.id)] });
    // First project: ask the browser to keep the data (ADR-3).
    if (get().persist !== 'persisted') {
      const persist = await requestPersistence();
      await storage.setSetting('persist', persist).catch(() => undefined);
      set({ persist });
    }
    return project;
  },

  async updateProject(id, change) {
    const current = get().project(id);
    if (!current) return undefined;
    const next = change(current);
    if (next === current) return current;
    set({ projects: [next, ...get().projects.filter((p) => p.id !== id)].sort(byRecent) });
    const storage = await getStorage();
    await queueWrite(id, () => storage.putProject(next));
    return next;
  },

  async deletePattern(projectId, patternId) {
    const storage = await getStorage();
    await get().updateProject(projectId, (p) => ({
      ...removePattern(p, patternId),
      updatedAt: new Date().toISOString(),
    }));
    await storage.deleteProgress(projectId, patternId).catch(() => undefined);
    const project = get().project(projectId);
    if (project) {
      const record = project.activePatternId
        ? await storage.getProgress(projectId, project.activePatternId).catch(() => undefined)
        : undefined;
      set({ progress: { ...get().progress, [projectId]: record } });
    }
  },

  async deleteProject(id) {
    const storage = await getStorage();
    await queueWrite(id, () => storage.deleteProject(id));
    const { [id]: _removed, ...progress } = get().progress;
    set({ projects: get().projects.filter((p) => p.id !== id), progress });
  },

  async restartProject(id) {
    const project = get().project(id);
    if (!project) return;
    const storage = await getStorage();
    await get().updateProject(id, (p) => {
      const { finishedRows: _finished, ...rest } = p;
      const first = p.patterns[0]?.id;
      return {
        ...rest,
        ...(first ? { activePatternId: first } : {}),
        updatedAt: new Date().toISOString(),
      };
    });
    for (const pattern of project.patterns) {
      await queueWrite(id, () => storage.deleteProgress(id, pattern.id).catch(() => undefined));
    }
    set({ progress: { ...get().progress, [id]: undefined } });
  },

  async progressOf(projectId) {
    const storage = await getStorage();
    const list = await storage.listProgress(projectId).catch(() => []);
    return Object.fromEntries(list.map((r) => [r.patternId, r]));
  },

  noteProgress(record) {
    const project = get().project(record.projectId);
    if (!project || project.activePatternId !== record.patternId) return;
    set({ progress: { ...get().progress, [record.projectId]: record } });
  },

  async exportBackup() {
    const storage = await getStorage();
    const [projects, progress] = await Promise.all([
      storage.listProjects(),
      storage.listProgress(),
    ]);
    return serializeBackup({ projects, progress });
  },

  async previewRestore(text) {
    const read = readBackupFile(text);
    if (!read.ok) return read;
    const storage = await getStorage();
    const [projects, progress] = await Promise.all([
      storage.listProjects(),
      storage.listProgress(),
    ]);
    return {
      ok: true,
      backup: read.value,
      plan: planRestore({ projects, progress }, read.value),
    };
  },

  async applyRestore(plan) {
    const storage = await getStorage();
    const writes = (action: string) => action === 'add' || action === 'update';
    for (const item of plan.projects)
      if (writes(item.action)) await storage.putProject(item.record);
    for (const record of plan.progress) await storage.putProgress(record);
    // Refresh in place: the page that started the restore stays mounted.
    set(await readAll(storage));
  },
}));
