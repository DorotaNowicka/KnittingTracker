import { resolveSize } from '../basics';
import type { ResolvedStage } from '../layout/resolve';
import type { Gauge, Pattern, Project } from '../schema/pattern';

/**
 * Length estimates for open-ended stages (DR-5): "knit until the piece measures 34 cm". With a
 * gauge (rows in 10 cm) the target becomes an approximate row count. The knitter still decides
 * when the stage ends: this is an estimate, never a stop.
 */

/** The knitter's own gauge when set, else the pattern's; null when neither is known. */
export function effectiveGauge(
  pattern: Pick<Pattern, 'gauge'>,
  project?: Pick<Project, 'gauge'> | null,
): Gauge | null {
  return project?.gauge ?? pattern.gauge ?? null;
}

export const cmForRows = (rows: number, gauge: Gauge): number => (rows * 10) / gauge.rows;
export const rowsForCm = (cm: number, gauge: Gauge): number => Math.round((cm * gauge.rows) / 10);

export interface LengthEstimate {
  /** Target length of the stage in cm (this size). */
  readonly targetCm: number;
  /** Estimated rows for the target, or null without a gauge. */
  readonly targetRows: number | null;
  /** Approximate length knitted so far, or null without a gauge. */
  readonly doneCm: number | null;
  /** Estimated rows still to knit (never negative), or null without a gauge. */
  readonly rowsLeft: number | null;
}

/** Estimate for a stage with a target length; null when the stage has none. */
export function lengthEstimate(
  stage: ResolvedStage,
  rowsDone: number,
  gauge: Gauge | null,
): LengthEstimate | null {
  const target = stage.stage.targetCm;
  if (target === undefined) return null;
  let targetCm: number;
  try {
    targetCm = resolveSize(target, stage.sizeIndex);
  } catch {
    return null;
  }
  if (!gauge) return { targetCm, targetRows: null, doneCm: null, rowsLeft: null };
  const targetRows = rowsForCm(targetCm, gauge);
  return {
    targetCm,
    targetRows,
    doneCm: Math.round(cmForRows(rowsDone, gauge) * 10) / 10,
    rowsLeft: Math.max(0, targetRows - rowsDone),
  };
}
