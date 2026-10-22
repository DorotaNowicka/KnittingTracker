import { z } from 'zod';

// No eval (NFR-5): zod's JIT compiles validators with `new Function`, which a strict CSP blocks
// (and reports as a violation even when zod falls back). Validation speed is not a concern here.
z.config({ jitless: true });

/**
 * Persisted data model (ADR-2, schema v3), defined as zod schemas so every external boundary
 * (files, storage, worker messages) is validated. TypeScript types are inferred from the schemas.
 *
 * Hierarchy (owner decision 2026-10-22): a **project** (projekt, e.g. a sweater) holds several
 * **patterns** (wzory, e.g. "Body in the round", "Sleeve"), and a pattern holds several **charts**
 * (schematy, e.g. A.1–A.4). A pattern is one grid: its charts side by side in one round or row,
 * tracked with its own progress. Patterns belong to their project; reuse is by copying.
 *
 * Conventions:
 * - Charts are stored as the **RS view**: `rows[0]` is chart row 1 (bottom), characters run
 *   left → right as drawn.
 * - A pattern layout lists segments in **work order of an RS row**: stitch 1 is the first stitch
 *   worked, which is the rightmost stitch in the RS view.
 */

const id = z.string().min(1).max(120);
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();

export const localizedTextSchema = z.object({ pl: z.string(), en: z.string() });

/** One value for all sizes, or one per size. */
export const sizeValueSchema = z.union([nonNegInt, z.array(nonNegInt).min(1)]);

/** A measurement in cm (decimals allowed), one for all sizes or one per size. */
const cm = z.number().finite().nonnegative().max(1000);
export const sizeMeasureSchema = z.union([cm, z.array(cm).min(1)]);

/** Gauge: stitches and rows in 10 cm (the swatch the pattern states, or the knitter's own). */
export const gaugeSchema = z.object({
  stitches: z.number().finite().positive().max(100),
  rows: z.number().finite().positive().max(200),
});

const point = z.tuple([z.number().finite(), z.number().finite()]);
export const glyphSchema = z.object({
  primitives: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('line'), from: point, to: point }),
        z.object({ kind: z.literal('polyline'), points: z.array(point).min(2) }),
        z.object({
          kind: z.literal('polygon'),
          points: z.array(point).min(3),
          fill: z.enum(['ink', 'muted']),
        }),
        z.object({
          kind: z.literal('circle'),
          center: point,
          radius: z.number().positive(),
          fill: z.enum(['none', 'ink']),
        }),
        z.object({
          kind: z.literal('text'),
          at: point,
          text: z.string().max(8),
          size: z.number().positive().max(1),
        }),
      ]),
    )
    .max(64),
});

const stitchKind = z.enum(['k', 'p']);

/** A pattern-defined symbol (built-ins are not stored in files). Ids must start with `user:`. */
export const customSymbolSchema = z.object({
  id: z.string().regex(/^user:[\w-]{1,64}$/),
  numbers: z.record(z.string(), z.string()).optional(),
  family: z.enum(['basic', 'decrease', 'increase', 'cable', 'bind-off', 'no-stitch']),
  width: posInt.max(12),
  consumes: nonNegInt.max(12),
  produces: nonNegInt.max(12),
  worked: z.boolean(),
  flow: z.object({ in: z.array(stitchKind), out: z.array(stitchKind) }).optional(),
  ws: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('invert'), symbolId: id }),
    z.object({ mode: z.literal('same') }),
    z.object({ mode: z.literal('explicit'), text: localizedTextSchema }),
    z.object({ mode: z.literal('unsupported') }),
  ]),
  glyph: glyphSchema,
  label: localizedTextSchema,
  description: localizedTextSchema,
});

/** The pattern's own legend: links a symbol to the wording/number used in that pattern. */
export const legendEntrySchema = z.object({
  symbolId: id,
  number: z.string().max(20).optional(),
  text: z.string().max(500).optional(),
});

/** Reserved chart character: continuation of the multi-cell symbol anchored to its left. */
export const CONTINUATION = '.';

export const chartSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  width: posInt.max(1000),
  height: posInt.max(1000),
  /** Single character → symbol id. `.` is reserved for continuation cells. */
  palette: z.record(z.string().length(1), id),
  rows: z.array(z.string()),
});

export const segmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('chart'),
    placementId: id,
    chartId: id,
    /** Stitches covered (horizontal repeat, possibly partial). Default: the chart width. */
    stitches: sizeValueSchema.optional(),
    /** Chart column (1-based, left→right) worked first. Default: the rightmost column. */
    startColumn: posInt.optional(),
    /** Vertical phase: chart row for pattern row r is ((r - 1 + rowOffset) mod height) + 1. */
    rowOffset: nonNegInt.optional(),
    /**
     * Continue the vertical phase of a placement in another pattern of the same project (DR-3):
     * this placement starts with the chart row after the last one worked there. Overrides
     * `rowOffset`.
     */
    continueFrom: z.object({ patternId: id, placementId: id }).optional(),
    /** Display label of the zone; defaults to the chart name. */
    label: z.string().max(40).optional(),
  }),
  z.object({
    kind: z.literal('marker'),
    id,
    /** Name of the section that starts at this marker (e.g. "Przód"). */
    sectionName: z.string().max(40).optional(),
  }),
]);

/** Changes that leave a chart as the designer drew it (DR-1), e.g. "A.1 in plain knit". */
export const modificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('replaceChart'),
    /** Chart whose content is replaced everywhere it is placed. Layout widths stay the same. */
    chartId: id,
    chart: chartSchema,
    note: z.string().max(200).optional(),
  }),
]);

/** A pattern (wzór): one grid of charts worked side by side, with its own progress. */
export const patternSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  construction: z.enum(['round', 'flat']),
  firstRowSide: z.enum(['RS', 'WS']),
  /** Charts of this pattern (schematy). Ids are unique within the pattern. */
  charts: z.array(chartSchema),
  /** Symbols this pattern defines itself (built-ins are not stored). */
  symbols: z.array(customSymbolSchema),
  /** The pattern's own legend wording. */
  legend: z.array(legendEntrySchema),
  layout: z.array(segmentSchema).min(1),
  /** Planned row count; omit for open-ended patterns ("until X cm"). */
  rows: sizeValueSchema.optional(),
  /** Stitch count stated by the pattern text, cross-checked against the layout. */
  expectedStitches: sizeValueSchema.optional(),
  /**
   * How progress is tracked (DR-9): every stitch (default) or whole rows only, for simple
   * textures such as ribbing where a row counter is enough.
   */
  tracking: z.enum(['stitches', 'rows']).optional(),
  /** Length to knit in an open-ended pattern ("until the piece measures 34 cm", DR-5). */
  targetCm: sizeMeasureSchema.optional(),
  /** The knitter's own changes to charts of this pattern (DR-1). */
  modifications: z.array(modificationSchema).optional(),
});

/** A project (projekt): what is being knitted, made of patterns worked one after another. */
export const projectSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  /** Bumped once per editing session of the project content (patterns, charts, sizes). */
  revision: nonNegInt,
  designer: z.string().max(120).optional(),
  notes: z.string().max(5000).optional(),
  /** Garment sizes; per-size numbers in patterns are indexed by position in this list. */
  sizes: z.array(z.string().min(1).max(20)).min(1),
  sizeIndex: nonNegInt,
  /** Gauge stated by the designer (10 × 10 cm). */
  gauge: gaugeSchema.optional(),
  /** The knitter's own gauge, used instead of the designer's for length estimates. */
  knitterGauge: gaugeSchema.optional(),
  /** Patterns in the order they are knitted. A new project may have none yet. */
  patterns: z.array(patternSchema),
  /** The pattern the tracker opens. */
  activePatternId: id.optional(),
  /**
   * Rows actually worked in patterns the knitter finished (pattern id → rows). Open-ended
   * patterns end here; patterns that continue a chart's phase count from this (DR-3, DR-5).
   */
  finishedRows: z.record(id, nonNegInt).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const progressSchema = z.object({
  done: nonNegInt,
  undo: z.array(nonNegInt),
  redo: z.array(nonNegInt),
});

export type Chart = z.infer<typeof chartSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type ChartSegment = Extract<Segment, { kind: 'chart' }>;
export type MarkerSegment = Extract<Segment, { kind: 'marker' }>;
export type Pattern = z.infer<typeof patternSchema>;
export type LegendEntry = z.infer<typeof legendEntrySchema>;
export type CustomSymbol = z.infer<typeof customSymbolSchema>;
export type Modification = z.infer<typeof modificationSchema>;
export type ProgressRecord = z.infer<typeof progressSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Gauge = z.infer<typeof gaugeSchema>;

/** The parts of a project that resolving and validating a pattern needs. */
export type ProjectContent = Pick<Project, 'sizes' | 'sizeIndex' | 'patterns' | 'finishedRows'>;
