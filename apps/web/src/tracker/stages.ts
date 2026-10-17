import { mod, type Pattern, type ResolvedStage, type Stage } from '@kt/core';

/** The stage after `stageId` in the pattern's order, if any. */
export const nextStageOf = (pattern: Pattern, stageId: string): Stage | undefined =>
  pattern.stages[pattern.stages.findIndex((s) => s.id === stageId) + 1];

/** Chart row of every zone in stage row `row` (one entry per distinct label and row). */
export function chartRowsAt(stage: ResolvedStage, row: number) {
  const seen = new Set<string>();
  const out: { label: string; row: number; height: number; known: boolean }[] = [];
  for (const z of stage.zones) {
    const h = z.chart.chart.height;
    const r = mod(row - 1 + z.rowOffset, h) + 1;
    const key = `${z.label}\u0000${r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: z.label, row: r, height: h, known: z.continued?.known ?? true });
  }
  return out;
}
