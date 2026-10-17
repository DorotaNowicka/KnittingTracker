import { z } from 'zod';

// No eval (NFR-5): zod's JIT compiles validators with `new Function`, which a strict CSP blocks
// (and reports as a violation even when zod falls back). Validation speed is not a concern here.
z.config({ jitless: true });

/**
 * Persisted data model (ADR-2), defined as zod schemas so every external boundary (files, storage,
 * worker messages) is validated. TypeScript types are inferred from the schemas.
 *
 * Conventions:
 * - Charts are stored as the **RS view**: `rows[0]` is chart row 1 (bottom), characters run
 *   left → right as drawn.
 * - A stage layout lists segments in **work order of an RS row**: stitch 1 is the first stitch
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
    /** Vertical phase: chart row for stage row r is ((r - 1 + rowOffset) mod height) + 1. */
    rowOffset: nonNegInt.optional(),
    /**
     * Continue the vertical phase of a placement in an earlier stage (DR-3): this placement starts
     * with the chart row after the last one worked there. Overrides `rowOffset`.
     */
    continueFrom: z.object({ stageId: id, placementId: id }).optional(),
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

export const stageSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  construction: z.enum(['round', 'flat']),
  firstRowSide: z.enum(['RS', 'WS']),
  layout: z.array(segmentSchema).min(1),
  /** Planned row count; omit for open-ended stages ("until X cm"). */
  rows: sizeValueSchema.optional(),
  /** Stitch count stated by the pattern text, cross-checked against the layout. */
  expectedStitches: sizeValueSchema.optional(),
  /**
   * How progress is tracked (DR-9): every stitch (default) or whole rows only, for simple
   * textures such as ribbing where a row counter is enough.
   */
  tracking: z.enum(['stitches', 'rows']).optional(),
  /** Length to knit in an open-ended stage ("until the piece measures 34 cm", DR-5). */
  targetCm: sizeMeasureSchema.optional(),
});

export const patternSchema = z.object({
  id,
  revision: nonNegInt,
  title: z.string().min(1).max(120),
  designer: z.string().max(120).optional(),
  notes: z.string().max(5000).optional(),
  sizes: z.array(z.string().min(1).max(20)).min(1),
  /** Gauge stated by the pattern (10 × 10 cm). */
  gauge: gaugeSchema.optional(),
  symbols: z.array(customSymbolSchema),
  legend: z.array(legendEntrySchema),
  charts: z.array(chartSchema),
  stages: z.array(stageSchema).min(1),
});

/** Per-project changes that leave the pattern itself untouched (DR-1). */
export const modificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('replaceChart'),
    /** Chart whose content is replaced everywhere it is placed. Layout widths stay the same. */
    chartId: id,
    chart: chartSchema,
    note: z.string().max(200).optional(),
  }),
]);

export const progressSchema = z.object({
  done: nonNegInt,
  undo: z.array(nonNegInt),
  redo: z.array(nonNegInt),
});

export const projectSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  patternId: id,
  patternRevision: nonNegInt,
  sizeIndex: nonNegInt,
  activeStageId: id,
  modifications: z.array(modificationSchema),
  /** Progress per stage id. */
  progress: z.record(id, progressSchema),
  /**
   * Rows actually worked in stages the knitter finished (stage id → rows). Open-ended stages end
   * here; later stages that continue a chart's phase count from this (DR-3, DR-5).
   */
  finishedRows: z.record(id, nonNegInt).optional(),
  /** The knitter's own gauge, used instead of the pattern's for length estimates. */
  gauge: gaugeSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Chart = z.infer<typeof chartSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type ChartSegment = Extract<Segment, { kind: 'chart' }>;
export type MarkerSegment = Extract<Segment, { kind: 'marker' }>;
export type Stage = z.infer<typeof stageSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type LegendEntry = z.infer<typeof legendEntrySchema>;
export type CustomSymbol = z.infer<typeof customSymbolSchema>;
export type Modification = z.infer<typeof modificationSchema>;
export type ProgressRecord = z.infer<typeof progressSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Gauge = z.infer<typeof gaugeSchema>;
