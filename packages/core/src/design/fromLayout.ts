import { applySymbolRows, blankChart, chartToSymbolRows, repairRows } from '../chart/edit';
import type { ResolvedPattern } from '../layout/resolve';
import type { Chart, Design, Placement } from '../schema/pattern';
import { STD } from '../symbols/library';
import type { SymbolRegistry } from '../symbols/registry';

/**
 * Pieces from a pattern file (the charts of an imported PDF) for the pattern creator, and the
 * file's layout turned into creator tiles, so the knitter can correct an imported pattern with the
 * same tools she draws her own with.
 */

/** Id of a piece that comes from the pattern file's chart `chartId`. */
export const fileMotifId = (chartId: string) => `pdf:${chartId}`.slice(0, 120);

/** The file's charts as pieces for the creator's library. */
export const fileMotifs = (charts: readonly Chart[]): Chart[] =>
  charts.map((c) => ({ ...c, id: fileMotifId(c.id) }));

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Largest grid side the creator allows. */
const MAX = 1000;

/**
 * A copy of `chart` as `width` stitches whose rightmost stitch is chart column `startColumn` and
 * whose first row is chart row `rowOffset + 1`, so it lands on the grid exactly as the layout
 * worked it (a chart entered mid-way, or a section narrower or wider than whole repeats).
 */
function reshaped(
  chart: Chart,
  id: string,
  width: number,
  startColumn: number,
  rowOffset: number,
  registry: SymbolRegistry,
): Chart {
  const rows = chartToSymbolRows(chart);
  const out = Array.from({ length: chart.height }, (_, i) => {
    const source = rows[mod(i + rowOffset, chart.height)] ?? [];
    return Array.from(
      { length: width },
      (_, j) => source[mod(j - (width - 1) + (startColumn - 1), chart.width)] ?? STD.knit,
    );
  });
  return applySymbolRows(
    blankChart({ id, name: chart.name }, 1, 1),
    repairRows(out, registry, STD.knit),
  );
}

/** Whether a chart is nothing but knit, the grid's background anyway. */
export const plainKnit = (chart: Chart) =>
  chartToSymbolRows(chart).every((row) => row.every((id) => id === STD.knit));

/**
 * The creator design of a pattern as its layout works it at the resolved size: one tile per chart
 * section, standing on the bottom row and repeating upwards, as wide as the section (in whole
 * repeats of the chart when it divides evenly). Charts the caller calls `background` (plain filler
 * beside a centred pattern) stay background. The grid is as tall as the tallest chart: one repeat to work on.
 * Null when the layout has no charts or is wider than the creator allows.
 */
export function designFromLayout(
  stage: ResolvedPattern,
  options: {
    /** Charts left as background, not tiles (plain filler beside a centred pattern). */
    readonly background?: (chart: Chart) => boolean;
  } = {},
): Design | null {
  const width = stage.stitchCount;
  if (width < 1 || width > MAX) return null;
  const charts = new Map(stage.pattern.charts.map((c) => [c.id, c] as const));
  const motifs: Chart[] = [];
  const placements: Placement[] = [];
  let tallest = 1;
  for (const zone of [...stage.zones].sort((a, b) => a.firstStitch - b.firstStitch)) {
    const chart = charts.get(zone.chartId);
    if (!chart || options.background?.(chart)) continue;
    const wide = zone.lastStitch - zone.firstStitch + 1;
    const whole = wide % chart.width === 0;
    const plain = whole && zone.startColumn === chart.width && zone.rowOffset % chart.height === 0;
    const id = plain
      ? fileMotifId(chart.id)
      : `${fileMotifId(chart.id)}~${zone.placementId}`.slice(0, 120);
    if (!motifs.some((m) => m.id === id)) {
      motifs.push(
        plain
          ? { ...chart, id }
          : reshaped(
              chart,
              id,
              whole ? chart.width : wide,
              zone.startColumn,
              zone.rowOffset,
              stage.registry,
            ),
      );
    }
    placements.push({
      id: `p${placements.length + 1}`,
      motifId: id,
      col: zone.firstStitch,
      row: 1,
      repeatX: whole ? wide / chart.width : 1,
      repeatY: 'fill',
    });
    tallest = Math.max(tallest, chart.height);
  }
  if (placements.length === 0) return null;
  const height = Math.min(MAX, tallest);
  return { width, height, motifs, placements, cells: [] };
}
