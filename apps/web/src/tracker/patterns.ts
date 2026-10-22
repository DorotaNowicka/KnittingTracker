import { mod, type Pattern, type Project, type ResolvedPattern } from '@kt/core';

/** The pattern after `patternId` in the project's order, if any. */
export const nextPatternOf = (project: Project, patternId: string): Pattern | undefined =>
  project.patterns[project.patterns.findIndex((s) => s.id === patternId) + 1];

/** Chart row of every zone in pattern row `row` (one entry per distinct label and row). */
export function chartRowsAt(grid: ResolvedPattern, row: number) {
  const seen = new Set<string>();
  const out: { label: string; row: number; height: number; known: boolean }[] = [];
  for (const z of grid.zones) {
    const h = z.chart.chart.height;
    const r = mod(row - 1 + z.rowOffset, h) + 1;
    const key = `${z.label}\u0000${r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: z.label, row: r, height: h, known: z.continued?.known ?? true });
  }
  return out;
}
