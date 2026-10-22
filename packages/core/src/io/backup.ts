import { z } from 'zod';
import { FILE_FORMATS, SCHEMA_VERSION } from '../basics';
import { progressSchema, projectSchema } from '../schema/pattern';
import { migrate, type ReadResult } from './file';

/**
 * Full backups (ADR-3, M5): every project and progress record on the device in one file.
 *
 *   { "format": "knitting-tracker/backup", "schemaVersion": 3, "exportedAt": "…",
 *     "projects": [StoredProject], "progress": [StoredProgress] }
 *
 * Schema 2 backups (with a separate pattern list) are converted on reading (`legacy/convert.ts`).
 *
 * Reading never trusts the file: JSON.parse → migrate → zod per record. Invalid records are skipped
 * and reported, so one broken entry does not lose the rest.
 */

const id = z.string().min(1).max(120);
const iso = z.iso.datetime();

/** A project as kept on the device: its content. Progress is stored per pattern, see below. */
export const storedProjectSchema = projectSchema;

/** Progress of one pattern of a project. */
export const storedProgressSchema = progressSchema.extend({
  projectId: id,
  patternId: id,
  updatedAt: iso,
});

export type StoredProjectRecord = z.infer<typeof storedProjectSchema>;
export type StoredProgressRecord = z.infer<typeof storedProgressSchema>;

export interface BackupContent {
  readonly projects: readonly StoredProjectRecord[];
  readonly progress: readonly StoredProgressRecord[];
}

export interface ReadBackup extends BackupContent {
  readonly exportedAt: string | null;
  /** Records that did not validate and were left out (human-readable). */
  readonly skipped: readonly string[];
}

export function serializeBackup(content: BackupContent, now: Date = new Date()): string {
  const file = {
    format: FILE_FORMATS.backup,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    projects: content.projects,
    progress: content.progress,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const MAX_BACKUP_CHARS = 50 * 1024 * 1024;

function records<T>(list: unknown, schema: z.ZodType<T>, label: string, skipped: string[]): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  list.forEach((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      skipped.push(`${label} ${i + 1}: ${issue ? `${issue.path.join('.')} ${issue.message}` : ''}`);
    }
  });
  return out;
}

/** Parse, migrate and validate a backup file. Never throws. */
export function readBackupFile(text: string): ReadResult<ReadBackup> {
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, errors: ['The file is too large.'] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: ['This is not a KnittingTracker backup.'] };
  }
  if ((json as Record<string, unknown>)['format'] !== FILE_FORMATS.backup) {
    return { ok: false, errors: ['This is not a KnittingTracker backup.'] };
  }
  const migrated = migrate(json);
  if (!migrated.ok) return migrated;
  const doc = migrated.value;
  const skipped: string[] = [];
  const projects = records(doc['projects'], storedProjectSchema, 'project', skipped);
  const progress = records(doc['progress'], storedProgressSchema, 'progress', skipped);
  const exportedAt = typeof doc['exportedAt'] === 'string' ? doc['exportedAt'] : null;
  return { ok: true, value: { projects, progress, exportedAt, skipped } };
}

export type RestoreAction = 'add' | 'update' | 'keep' | 'same';

export interface RestorePlanItem<T> {
  readonly record: T;
  /**
   * add: not on this device; update: the backup copy is newer; keep: the device copy is newer
   * (or equally new but different); same: identical.
   */
  readonly action: RestoreAction;
}

export interface RestorePlan {
  readonly projects: readonly RestorePlanItem<StoredProjectRecord>[];
  /** Progress records written with their project (only for projects that are added or updated). */
  readonly progress: readonly StoredProgressRecord[];
}

function decide<T>(device: T | undefined, backup: T, time: (x: T) => string): RestoreAction {
  if (!device) return 'add';
  if (JSON.stringify(device) === JSON.stringify(backup)) return 'same';
  return time(backup) > time(device) ? 'update' : 'keep';
}

/**
 * Plan a restore that never loses newer work: projects missing on the device are added, projects
 * that are newer in the backup replace the device copy, and newer device projects are kept. A
 * project's progress travels with the project.
 */
export function planRestore(device: BackupContent, backup: BackupContent): RestorePlan {
  const devProjects = new Map(device.projects.map((p) => [p.id, p] as const));
  const projects = backup.projects.map((record) => ({
    record,
    action: decide(devProjects.get(record.id), record, (p) => p.updatedAt),
  }));
  const writing = new Set(
    projects.filter((p) => p.action === 'add' || p.action === 'update').map((p) => p.record.id),
  );
  const progress = backup.progress.filter((r) => writing.has(r.projectId));
  return { projects, progress };
}
