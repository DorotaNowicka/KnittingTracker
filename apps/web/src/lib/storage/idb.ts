import { migrateBackupDoc, storedProgressSchema, storedProjectSchema } from '@kt/core';
import Dexie, { type Table, type Transaction } from 'dexie';
import type { StorageAdapter, StoredProgress, StoredProject } from './types';

interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * Dexie schema versions follow the app's storage layout. Data migrations are pure functions in
 * @kt/core (ADR-3).
 *
 * - v1 (app 1.0, data schema 2): `patterns`, `projects` (one pattern each), `progress` per stage.
 * - v2 (data schema 3): `projects3` holds projects with their patterns and charts, `progress3`
 *   holds progress per pattern. The upgrade converts the v1 tables with the same function that
 *   converts old backups (`migrateBackupDoc`), so a database and a backup migrate identically.
 *   New tables are used because IndexedDB can't change a table's primary key in place.
 * - v3: the v1 tables are dropped (after v2's upgrade has read them).
 */
class KnittingDb extends Dexie {
  projects3!: Table<StoredProject, string>;
  progress3!: Table<StoredProgress, [string, string]>;
  settings!: Table<SettingRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      patterns: 'id',
      projects: 'id, patternId, updatedAt',
      progress: '[projectId+stageId], projectId',
      settings: 'key',
    });
    this.version(2)
      .stores({
        projects3: 'id, updatedAt',
        progress3: '[projectId+patternId], projectId',
      })
      .upgrade(upgradeToProjects);
    this.version(3).stores({ patterns: null, projects: null, progress: null });
  }
}

/** Convert the 1.0 tables (pattern + projects + progress per stage) to projects with patterns. */
export async function upgradeToProjects(tx: Transaction): Promise<void> {
  const [patterns, projects, progress] = await Promise.all([
    tx.table('patterns').toArray(),
    tx.table('projects').toArray(),
    tx.table('progress').toArray(),
  ]);
  if (patterns.length + projects.length + progress.length === 0) return;
  const doc = migrateBackupDoc({ patterns, projects, progress });
  const converted = (doc['projects'] as unknown[]).flatMap((p) => {
    const parsed = storedProjectSchema.safeParse(p);
    if (!parsed.success)
      console.warn('[storage] a project could not be converted and was left out');
    return parsed.success ? [parsed.data] : [];
  });
  const known = new Set(converted.map((p) => p.id));
  const records = (doc['progress'] as unknown[]).flatMap((r) => {
    const parsed = storedProgressSchema.safeParse(r);
    return parsed.success && known.has(parsed.data.projectId) ? [parsed.data] : [];
  });
  await tx.table('projects3').bulkPut(converted);
  await tx.table('progress3').bulkPut(records);
}

/** Drop records that no longer validate instead of crashing the app (and report them). */
function valid<T>(rows: T[], check: (row: T) => boolean, label: string): T[] {
  return rows.filter((row) => {
    const ok = check(row);
    if (!ok) console.warn(`[storage] skipped an invalid ${label} record`);
    return ok;
  });
}

const okProject = (p: StoredProject) => storedProjectSchema.safeParse(p).success;

/** Open IndexedDB. Throws when IndexedDB is unavailable or blocked. */
export async function createIdbStorage(name = 'knitting-tracker'): Promise<StorageAdapter> {
  const db = new KnittingDb(name);
  await db.open();
  return {
    kind: 'indexeddb',
    listProjects: async () => valid(await db.projects3.toArray(), okProject, 'project'),
    getProject: async (id) => {
      const p = await db.projects3.get(id);
      return p && okProject(p) ? p : undefined;
    },
    putProject: async (p) => void (await db.projects3.put(p)),
    deleteProject: async (id) =>
      db.transaction('rw', db.projects3, db.progress3, async () => {
        await db.projects3.delete(id);
        await db.progress3.where('projectId').equals(id).delete();
      }),
    getProgress: async (projectId, patternId) => db.progress3.get([projectId, patternId]),
    listProgress: async (projectId) =>
      projectId === undefined
        ? db.progress3.toArray()
        : db.progress3.where('projectId').equals(projectId).toArray(),
    putProgress: async (p) => void (await db.progress3.put(p)),
    deleteProgress: async (projectId, patternId) => db.progress3.delete([projectId, patternId]),
    getSetting: async <T>(key: string) => (await db.settings.get(key))?.value as T | undefined,
    setSetting: async (key, value) => void (await db.settings.put({ key, value })),
  };
}
