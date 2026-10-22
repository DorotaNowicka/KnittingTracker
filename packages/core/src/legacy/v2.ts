import { z } from 'zod';
import {
  chartSchema,
  customSymbolSchema,
  gaugeSchema,
  legendEntrySchema,
  progressSchema,
  sizeMeasureSchema,
  sizeValueSchema,
} from '../schema/pattern';

/**
 * Data model of schema versions 1 and 2 (before 3.0): a pattern held charts and a list of stages,
 * and a project tracked one pattern. Kept only so old files, backups and databases can be read
 * and converted ({@link ./convert}). Nothing new is written in this shape.
 */

const id = z.string().min(1).max(120);
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().nonnegative();

export const legacySegmentSchema = z.discriminatedUnion('kind', [
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

export const legacyStageSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  construction: z.enum(['round', 'flat']),
  firstRowSide: z.enum(['RS', 'WS']),
  layout: z.array(legacySegmentSchema).min(1),
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

export const legacyPatternSchema = z.object({
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
  stages: z.array(legacyStageSchema).min(1),
});

/** Per-project changes that leave the pattern itself untouched (DR-1). */
export const legacyModificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('replaceChart'),
    /** Chart whose content is replaced everywhere it is placed. Layout widths stay the same. */
    chartId: id,
    chart: chartSchema,
    note: z.string().max(200).optional(),
  }),
]);

export const legacyProjectSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  patternId: id,
  patternRevision: nonNegInt,
  sizeIndex: nonNegInt,
  activeStageId: id,
  modifications: z.array(legacyModificationSchema),
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

export type LegacySegment = z.infer<typeof legacySegmentSchema>;
export type LegacyStage = z.infer<typeof legacyStageSchema>;
export type LegacyPattern = z.infer<typeof legacyPatternSchema>;
export type LegacyModification = z.infer<typeof legacyModificationSchema>;
export type LegacyProject = z.infer<typeof legacyProjectSchema>;
