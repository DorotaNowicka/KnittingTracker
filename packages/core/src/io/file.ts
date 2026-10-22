import { FILE_FORMATS, SCHEMA_VERSION } from '../basics';
import { migrateBackupDoc, migratePatternFileDoc } from '../legacy/convert';
import { legacyPatternSchema } from '../legacy/v2';
import { projectSchema, type Project } from '../schema/pattern';

/**
 * Versioned project files (FR-7, ADR-3).
 *
 *   { "format": "knitting-tracker/project", "schemaVersion": 3, "exportedAt": "…", "project": {…} }
 *
 * Older single-pattern files ("knitting-tracker/pattern", schema 1–2) are still read: the
 * migration to schema 3 turns them into a project whose patterns are the former stages.
 *
 * Reading = JSON.parse → migrate to the current schema version → zod validation. Nothing from a
 * file is trusted before validation succeeds.
 */

/** A migration takes a document of version N and returns version N+1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered migrations, keyed by the version they upgrade FROM. They work on whole file documents
 * (pattern files and backups alike) and must stay pure and total: never drop user data.
 *
 * - 2 → 3: a project holds patterns; see `legacy/convert.ts`.
 * - 1 → 2 (M5): only optional fields were added (gauge, tracking, targetCm, continueFrom,
 *   finishedRows, project gauge), so v1 content is valid v2 content unchanged. The version still
 *   goes up so an older app refuses v2 files instead of silently dropping the new fields.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (doc) => doc,
  // 2 → 3: project → patterns → charts (stages became patterns of the project).
  2: (doc) => {
    if (doc['format'] === FILE_FORMATS.pattern) return migratePatternFileDoc(doc);
    if (doc['format'] === FILE_FORMATS.backup) return migrateBackupDoc(doc);
    return doc;
  },
};

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Bring a parsed file document to `target` version by applying migrations in order.
 * Files newer than the app are rejected (they may contain fields this version can't keep).
 */
export function migrate(
  doc: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): ReadResult<Record<string, unknown>> {
  if (!isRecord(doc)) return { ok: false, errors: ['The file is not a JSON object.'] };
  const version = doc['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, errors: ['Missing or invalid "schemaVersion".'] };
  }
  if (version > target) {
    return {
      ok: false,
      errors: [`The file was made by a newer version of the app (schema ${version} > ${target}).`],
    };
  }
  let current: Record<string, unknown> = doc;
  for (let v = version; v < target; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, errors: [`No migration from schema version ${v}.`] };
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return { ok: true, value: current };
}

/** A project file: the project content without progress (progress lives in backups). */
export function serializeProject(project: Project, now: Date = new Date()): string {
  const file = {
    format: FILE_FORMATS.project,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    project,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const MAX_FILE_CHARS = 20 * 1024 * 1024;

/** Parse and validate a project file (or an older pattern file). Never throws. */
export function readProjectFile(text: string): ReadResult<Project> {
  if (text.length > MAX_FILE_CHARS) return { ok: false, errors: ['The file is too large.'] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (
    !isRecord(json) ||
    (json['format'] !== FILE_FORMATS.project && json['format'] !== FILE_FORMATS.pattern)
  ) {
    return { ok: false, errors: ['This is not a KnittingTracker project file.'] };
  }
  const migrated = migrate(json);
  if (!migrated.ok) return migrated;
  const issues = (list: readonly { path: PropertyKey[]; message: string }[], root: string) =>
    list.slice(0, 20).map((i) => `${i.path.map(String).join('.') || root}: ${i.message}`);
  if (migrated.value['format'] !== FILE_FORMATS.project) {
    // A pattern file whose content did not convert: report it against the old pattern schema.
    const old = legacyPatternSchema.safeParse(migrated.value['pattern']);
    return {
      ok: false,
      errors: old.success
        ? ['The pattern in this file could not be converted.']
        : issues(old.error.issues, 'pattern'),
    };
  }
  const parsed = projectSchema.safeParse(migrated.value['project']);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error.issues, 'project') };
  return { ok: true, value: parsed.data };
}
