import { z } from 'zod';
import { FILE_FORMATS, SCHEMA_VERSION } from '../basics';
import { patternSchema, progressSchema, projectSchema } from '../schema/pattern';
import { migrate, type ReadResult } from './file';

/**
 * Full backups (ADR-3, M5): every pattern, project and progress record on the device in one file.
 *
 *   { "format": "knitting-tracker/backup", "schemaVersion": 2, "exportedAt": "…",
 *     "patterns": [StoredPattern], "projects": [StoredProject], "progress": [StoredProgress] }
 *
 * Reading never trusts the file: JSON.parse → migrate → zod per record. Invalid records are skipped
 * and reported, so one broken entry does not lose the rest.
 */

const id = z.string().min(1).max(120);
const iso = z.iso.datetime();

/** A pattern as kept on the device (with where it came from). */
export const storedPatternSchema = z.object({
  id,
  pattern: patternSchema,
  source: z.enum(['file', 'sample', 'user']),
  importedAt: iso,
  updatedAt: iso.optional(),
});

/** A project without its progress (progress is stored per stage, see below). */
export const storedProjectSchema = projectSchema.omit({ progress: true });

/** Progress of one project in one stage. */
export const storedProgressSchema = progressSchema.extend({
  projectId: id,
  stageId: id,
  updatedAt: iso,
});

export type StoredPatternRecord = z.infer<typeof storedPatternSchema>;
export type StoredProjectRecord = z.infer<typeof storedProjectSchema>;
export type StoredProgressRecord = z.infer<typeof storedProgressSchema>;

export interface BackupContent {
  readonly patterns: readonly StoredPatternRecord[];
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
    patterns: content.patterns,
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
  const patterns = records(doc['patterns'], storedPatternSchema, 'pattern', skipped);
  const projects = records(doc['projects'], storedProjectSchema, 'project', skipped);
  const progress = records(doc['progress'], storedProgressSchema, 'progress', skipped);
  const exportedAt = typeof doc['exportedAt'] === 'string' ? doc['exportedAt'] : null;
  return { ok: true, value: { patterns, projects, progress, exportedAt, skipped } };
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
  readonly patterns: readonly RestorePlanItem<StoredPatternRecord>[];
  readonly projects: readonly RestorePlanItem<StoredProjectRecord>[];
  /** Progress records written with their project (only for projects that are added or updated). */
  readonly progress: readonly StoredProgressRecord[];
  /** Projects left out because their pattern is neither on the device nor in the backup. */
  readonly orphans: readonly StoredProjectRecord[];
}

const patternTime = (p: StoredPatternRecord) => p.updatedAt ?? p.importedAt;

function decide<T>(device: T | undefined, backup: T, time: (x: T) => string): RestoreAction {
  if (!device) return 'add';
  if (JSON.stringify(device) === JSON.stringify(backup)) return 'same';
  return time(backup) > time(device) ? 'update' : 'keep';
}

/**
 * Plan a restore that never loses newer work: records missing on the device are added, records
 * that are newer in the backup replace the device copy, and newer device records are kept. A
 * project's progress travels with the project.
 */
export function planRestore(device: BackupContent, backup: BackupContent): RestorePlan {
  const devPatterns = new Map(device.patterns.map((p) => [p.id, p] as const));
  const devProjects = new Map(device.projects.map((p) => [p.id, p] as const));
  const patterns = backup.patterns.map((record) => ({
    record,
    action: decide(devPatterns.get(record.id), record, patternTime),
  }));
  const known = new Set([...devPatterns.keys(), ...backup.patterns.map((p) => p.id)]);
  const orphans: StoredProjectRecord[] = [];
  const projects: RestorePlanItem<StoredProjectRecord>[] = [];
  for (const record of backup.projects) {
    if (!known.has(record.patternId)) {
      orphans.push(record);
      continue;
    }
    projects.push({
      record,
      action: decide(devProjects.get(record.id), record, (p) => p.updatedAt),
    });
  }
  const writing = new Set(
    projects.filter((p) => p.action === 'add' || p.action === 'update').map((p) => p.record.id),
  );
  const progress = backup.progress.filter((r) => writing.has(r.projectId));
  return { patterns, projects, progress, orphans };
}
