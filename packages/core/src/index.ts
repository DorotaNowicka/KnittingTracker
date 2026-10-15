/**
 * @kt/core — pure domain layer of KnittingTracker.
 *
 * Hard rule (ADR-1, NFR-1): this package has zero DOM/UI dependencies. The tsconfig `lib` has no
 * "DOM" and ESLint forbids importing browser or UI modules here.
 *
 * M0 ships only the package boundary. The model, layout and progress engines arrive in M1.
 */

/** Version of the persisted/exported data schema. Bumped together with a migration (ADR-3). */
export const SCHEMA_VERSION = 1 as const;

/** Format identifiers written into exported files (ADR-3). */
export const FILE_FORMATS = {
  pattern: 'knitting-tracker/pattern',
  backup: 'knitting-tracker/backup',
} as const;

export type FileFormat = (typeof FILE_FORMATS)[keyof typeof FILE_FORMATS];

/** Narrowing helper for the `format` header of an imported file. */
export function isFileFormat(value: unknown): value is FileFormat {
  return value === FILE_FORMATS.pattern || value === FILE_FORMATS.backup;
}
