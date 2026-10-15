import { FILE_FORMATS, SCHEMA_VERSION } from '../basics';
import { patternSchema, type Pattern } from '../schema/pattern';

/**
 * Versioned pattern files (FR-7, ADR-3).
 *
 *   { "format": "knitting-tracker/pattern", "schemaVersion": 1, "exportedAt": "…", "pattern": {…} }
 *
 * Reading = JSON.parse → migrate to the current schema version → zod validation. Nothing from a
 * file is trusted before validation succeeds.
 */

/** A migration takes a document of version N and returns version N+1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** Registered migrations, keyed by the version they upgrade FROM. None yet: v1 is the first. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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

export function serializePattern(pattern: Pattern, now: Date = new Date()): string {
  const file = {
    format: FILE_FORMATS.pattern,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    pattern,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const MAX_FILE_CHARS = 20 * 1024 * 1024;

/** Parse and validate a pattern file. Never throws. */
export function readPatternFile(text: string): ReadResult<Pattern> {
  if (text.length > MAX_FILE_CHARS) return { ok: false, errors: ['The file is too large.'] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (!isRecord(json) || json['format'] !== FILE_FORMATS.pattern) {
    return { ok: false, errors: ['This is not a KnittingTracker pattern file.'] };
  }
  const migrated = migrate(json);
  if (!migrated.ok) return migrated;
  const parsed = patternSchema.safeParse(migrated.value['pattern']);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || 'pattern'}: ${i.message}`),
    };
  }
  return { ok: true, value: parsed.data };
}
