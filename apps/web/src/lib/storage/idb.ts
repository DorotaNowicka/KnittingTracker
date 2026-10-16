import { patternSchema, projectSchema } from '@kt/core';
import Dexie, { type Table } from 'dexie';
import type { StorageAdapter, StoredPattern, StoredProgress, StoredProject } from './types';

interface SettingRow {
  key: string;
  value: unknown;
}

class KnittingDb extends Dexie {
  patterns!: Table<StoredPattern, string>;
  projects!: Table<StoredProject, string>;
  progress!: Table<StoredProgress, [string, string]>;
  settings!: Table<SettingRow, string>;

  constructor(name: string) {
    super(name);
    // Dexie schema versions follow the app's storage layout. Data migrations (pattern schema
    // versions) are pure functions in @kt/core and run on read (ADR-3).
    this.version(1).stores({
      patterns: 'id',
      projects: 'id, patternId, updatedAt',
      progress: '[projectId+stageId], projectId',
      settings: 'key',
    });
  }
}

const storedProjectSchema = projectSchema.omit({ progress: true });

/** Drop records that no longer validate instead of crashing the app (and report them). */
function valid<T>(rows: T[], check: (row: T) => boolean, label: string): T[] {
  return rows.filter((row) => {
    const ok = check(row);
    if (!ok) console.warn(`[storage] skipped an invalid ${label} record`);
    return ok;
  });
}

const okPattern = (p: StoredPattern) => patternSchema.safeParse(p.pattern).success;
const okProject = (p: StoredProject) => storedProjectSchema.safeParse(p).success;

/** Open IndexedDB. Throws when IndexedDB is unavailable or blocked. */
export async function createIdbStorage(name = 'knitting-tracker'): Promise<StorageAdapter> {
  const db = new KnittingDb(name);
  await db.open();
  return {
    kind: 'indexeddb',
    listPatterns: async () => valid(await db.patterns.toArray(), okPattern, 'pattern'),
    getPattern: async (id) => {
      const p = await db.patterns.get(id);
      return p && okPattern(p) ? p : undefined;
    },
    putPattern: async (p) => void (await db.patterns.put(p)),
    deletePattern: async (id) => db.patterns.delete(id),
    listProjects: async () => valid(await db.projects.toArray(), okProject, 'project'),
    getProject: async (id) => {
      const p = await db.projects.get(id);
      return p && okProject(p) ? p : undefined;
    },
    putProject: async (p) => void (await db.projects.put(p)),
    deleteProject: async (id) =>
      db.transaction('rw', db.projects, db.progress, async () => {
        await db.projects.delete(id);
        await db.progress.where('projectId').equals(id).delete();
      }),
    getProgress: async (projectId, stageId) => db.progress.get([projectId, stageId]),
    listProgress: async (projectId) =>
      projectId === undefined
        ? db.progress.toArray()
        : db.progress.where('projectId').equals(projectId).toArray(),
    putProgress: async (p) => void (await db.progress.put(p)),
    getSetting: async <T>(key: string) => (await db.settings.get(key))?.value as T | undefined,
    setSetting: async (key, value) => void (await db.settings.put({ key, value })),
  };
}
