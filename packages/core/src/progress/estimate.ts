import { resolveSize } from '../basics';
import type { ResolvedPattern } from '../layout/resolve';
import type { Gauge, Project } from '../schema/pattern';

/**
 * Length estimates for open-ended patterns (DR-5): "knit until the piece measures 34 cm". With a
 * gauge (rows in 10 cm) the target becomes an approximate row count. The knitter still decides
 * when the pattern ends: this is an estimate, never a stop.
 */

/** The knitter's own gauge when set, else the pattern's; null when neither is known. */
export function effectiveGauge(project: Pick<Project, 'gauge' | 'knitterGauge'>): Gauge | null {
  return project.knitterGauge ?? project.gauge ?? null;
}

export const cmForRows = (rows: number, gauge: Gauge): number => (rows * 10) / gauge.rows;
export const rowsForCm = (cm: number, gauge: Gauge): number => Math.round((cm * gauge.rows) / 10);

export interface LengthEstimate {
  /** Target length of the pattern in cm (this size). */
  readonly targetCm: number;
  /** Estimated rows for the target, or null without a gauge. */
  readonly targetRows: number | null;
  /** Approximate length knitted so far, or null without a gauge. */
  readonly doneCm: number | null;
  /** Estimated rows still to knit (never negative), or null without a gauge. */
  readonly rowsLeft: number | null;
}

/** Estimate for a pattern with a target length; null when the pattern has none. */
export function lengthEstimate(
  grid: ResolvedPattern,
  rowsDone: number,
  gauge: Gauge | null,
): LengthEstimate | null {
  const target = grid.pattern.targetCm;
  if (target === undefined) return null;
  let targetCm: number;
  try {
    targetCm = resolveSize(target, grid.sizeIndex);
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
