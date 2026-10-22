/**
 * Small shared building blocks of the domain: schema version, file format ids, localized text,
 * per-size values and diagnostics.
 */

/**
 * Version of the persisted/exported data schema. Bumped together with a migration (ADR-3).
 * v2 (M5): gauge, stage tracking mode and target length, chart phase continuation, finished rows
 * and the knitter's own gauge on projects.
 * v3: a project holds patterns, a pattern holds charts (the former stages became patterns).
 */
export const SCHEMA_VERSION = 3 as const;

/** Format identifiers written into exported files (ADR-3). */
export const FILE_FORMATS = {
  project: 'knitting-tracker/project',
  backup: 'knitting-tracker/backup',
  /** Schema v1–v2 single-pattern files; read (converted to a project), never written. */
  pattern: 'knitting-tracker/pattern',
} as const;

export type FileFormat = (typeof FILE_FORMATS)[keyof typeof FILE_FORMATS];

/** Narrowing helper for the `format` header of an imported file. */
export function isFileFormat(value: unknown): value is FileFormat {
  return Object.values(FILE_FORMATS).includes(value as FileFormat);
}

/** UI languages supported by built-in texts. Pattern texts entered by users are plain strings. */
export type Locale = 'pl' | 'en';
export type LocalizedText = Readonly<Record<Locale, string>>;

/**
 * A number that may differ per garment size: either one value for all sizes or one value per size
 * (index = position in `Project.sizes`).
 */
export type SizeValue = number | readonly number[];

/** Resolve a {@link SizeValue} for the size at `sizeIndex`. Throws if the list is too short. */
export function resolveSize(value: SizeValue, sizeIndex: number): number {
  if (typeof value === 'number') return value;
  const v = value[sizeIndex];
  if (v === undefined) {
    throw new RangeError(`No value for size index ${sizeIndex} (list has ${value.length})`);
  }
  return v;
}

export type Severity = 'error' | 'warning' | 'info';

/** A validation finding. Location fields are optional and 1-based (rows bottom→top, columns left→right). */
export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly chartId?: string;
  readonly patternId?: string;
  readonly row?: number;
  readonly col?: number;
  /** Values for a localized message (`diag.<code>` in the UI); `message` is the English fallback. */
  readonly params?: Readonly<Record<string, string | number>>;
}

type Where = Pick<Diagnostic, 'chartId' | 'patternId' | 'row' | 'col'>;

export function diagnostic(
  code: string,
  severity: Severity,
  message: string,
  where: { chartId?: string; patternId?: string; row?: number; col?: number } = {},
  params?: Readonly<Record<string, string | number>>,
): Diagnostic {
  const loc: { -readonly [K in keyof Where]?: Where[K] } = {};
  if (where.chartId !== undefined) loc.chartId = where.chartId;
  if (where.patternId !== undefined) loc.patternId = where.patternId;
  if (where.row !== undefined) loc.row = where.row;
  if (where.col !== undefined) loc.col = where.col;
  return params ? { code, severity, message, ...loc, params } : { code, severity, message, ...loc };
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === 'error');

/** Positive modulo: result is always in [0, n). */
export const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Greatest common divisor and least common multiple of positive integers. */
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
