import { chartBands, type ChartBand } from './bands';
import { arrowCharts, chartWidths, textArrows, type TextArrow } from './text';

/**
 * Which recognised chart is which, read from the pattern text — the charts of a PDF are images,
 * so their names ("A.1") and the sizes they are drawn for ("S - M - L") are not in the text layer.
 *
 * - Charts with arrows are the yoke's: worked one after another, the motif after each arrow as wide
 *   as the text says ("Strzałka-2: … 11 motywów po 20 oczek"). The order of these charts that fits
 *   the text best is the chain of a size; charts drawn per size group form one chain per group.
 *   They take the names of "oznaczonych strzałką w schematach A.1 i A.2", in order.
 * - Other charts are named by the width the text gives them ("wg schematu A.3 po 6 oczek") when
 *   exactly one chart has that width.
 */
export interface PlanChartInput {
  /** Symbol ids, row 1 first; `std:none` where the chart has no stitch. */
  readonly rows: readonly (readonly (string | null)[])[];
  readonly arrows?: readonly number[];
  /** A name found in the text layer right above the chart, if any. */
  readonly name?: string;
  /** The image it was found in (charts of one chain are often drawn together). */
  readonly source?: number;
}

export interface ChartPlan {
  /** Per chart: its name as the text calls it ("A.1"), or null when unknown. */
  readonly base: readonly (string | null)[];
  /** Per chart: the sizes (indices) it is drawn for; null: every size. */
  readonly sizes: readonly (readonly number[] | null)[];
  /** Per chart: its bands (one for a rectangle without arrows). */
  readonly bands: readonly (readonly ChartBand[])[];
  /** The arrows of the text, by number. */
  readonly arrows: readonly TextArrow[];
  /** Per size: the charts with arrows in working order (empty: not known). */
  readonly chains: readonly (readonly number[])[];
}

const widthOf = (b: ChartBand) => b.right - b.left + 1;

/** Ordered picks of distinct items, 1 to `max` long. */
function arrangements(items: readonly number[], max: number): number[][] {
  const out: number[][] = [];
  const walk = (path: number[]) => {
    if (path.length > 0) out.push(path);
    if (path.length === max) return;
    for (const it of items) if (!path.includes(it)) walk([...path, it]);
  };
  walk([]);
  return out;
}

/** How well a chain of charts fits the arrows of one size: +1 per matching width, −1 per wrong one. */
function chainScore(
  chain: readonly number[],
  bands: readonly (readonly ChartBand[])[],
  widths: readonly (number | null)[],
): number {
  const all = chain.flatMap((c) => bands[c] ?? []);
  let k = 0;
  let score = 0;
  all.forEach((b, i) => {
    if (!b.arrow) return;
    const want = widths[k++];
    const next = all[i + 1];
    if (want === null || want === undefined || !next) return;
    score += widthOf(next) === want ? 1 : -1;
  });
  return score;
}

export function planCharts(
  charts: readonly PlanChartInput[],
  text: string,
  sizes: readonly string[],
): ChartPlan {
  const n = Math.max(1, sizes.length);
  const bands = charts.map((c) => chartBands(c.rows, c.arrows));
  const arrows = textArrows(text, sizes);
  const order = arrowCharts(text);
  const arrowed = charts.flatMap((c, i) => ((c.arrows?.length ?? 0) > 0 ? [i] : []));
  const arrowCount = (chain: readonly number[]) =>
    chain.reduce((sum, c) => sum + (charts[c]?.arrows?.length ?? 0), 0);

  // Sizes whose arrows read the same (count and motif widths) share one chain of charts.
  const groups: { sizes: number[]; widths: (number | null)[] }[] = [];
  for (let s = 0; s < n; s++) {
    const own = arrows.filter((a) => a.total[s] !== null);
    if (own.length === 0) continue;
    const widths = own.map((a) => a.width[s] ?? null);
    const same = groups.find((g) => g.widths.join() === widths.join());
    if (same) same.sizes.push(s);
    else groups.push({ sizes: [s], widths });
  }
  // Per group, the orders of charts that fit its arrows best (all of them, when several tie).
  const candidates = groups.map((g) => {
    if (arrowed.length === 0) return [];
    const max = order.length > 0 ? order.length : Math.min(3, arrowed.length);
    let best: number[][] = [];
    let top = 0;
    for (const chain of arrangements(arrowed, max)) {
      if (order.length > 0 && chain.length !== order.length) continue;
      if (arrowCount(chain) !== g.widths.length) continue;
      const score = chainScore(chain, bands, g.widths);
      if (score <= 0 || score < top) continue;
      if (score > top) best = [];
      top = score;
      best.push(chain);
    }
    return best;
  });
  // One chain per group, no chart in two groups (a chart is drawn for one group of sizes). Among
  // several ways, the one keeping a chain's charts in one image wins, then the one where earlier
  // sizes use earlier charts (patterns draw the small sizes first).
  const source = (c: number) => charts[c]?.source ?? 0;
  const together = (chain: readonly number[]) =>
    chain.reduce((k, c, i) => k + (i > 0 && source(chain[i - 1] ?? -1) === source(c) ? 1 : 0), 0);
  const mean = (chain: readonly number[]) =>
    chain.reduce((sum, c) => sum + source(c), 0) / Math.max(1, chain.length);
  let pick: { chains: number[][]; rank: [number, number] } | null = null;
  let tie = false;
  const walk = (g: number, chosen: number[][]) => {
    if (g === groups.length) {
      const rank: [number, number] = [
        chosen.reduce((k, ch) => k + together(ch), 0),
        -chosen.reduce(
          (p, ch, i) =>
            p +
            chosen.slice(i + 1).reduce((q, later) => q + Math.max(0, mean(ch) - mean(later)), 0),
          0,
        ),
      ];
      const better =
        !pick || rank[0] > pick.rank[0] || (rank[0] === pick.rank[0] && rank[1] > pick.rank[1]);
      const same = pick && rank[0] === pick.rank[0] && rank[1] === pick.rank[1];
      if (better) {
        pick = { chains: chosen, rank };
        tie = false;
      } else if (same) tie = true;
      return;
    }
    const options = candidates[g] ?? [];
    if (options.length === 0) return walk(g + 1, [...chosen, []]);
    for (const chain of options)
      if (!chain.some((c) => chosen.some((ch) => ch.includes(c)))) walk(g + 1, [...chosen, chain]);
  };
  if (groups.length > 0) walk(0, []);
  const chosen: number[][] = pick && !tie ? (pick as { chains: number[][] }).chains : [];
  const chains: number[][] = Array.from({ length: n }, () => []);
  groups.forEach((g, i) => {
    for (const s of g.sizes) chains[s] = chosen[i] ?? [];
  });

  const base: (string | null)[] = charts.map((c) => c.name ?? null);
  const chartSizes: (number[] | null)[] = charts.map(() => null);
  const inChain = new Set(chains.flat());
  for (const c of inChain) {
    const forSizes = chains.flatMap((chain, s) => (chain.includes(c) ? [s] : []));
    chartSizes[c] = forSizes.length === n ? null : forSizes;
    if (base[c] === null) {
      const at = chains.find((chain) => chain.includes(c))?.indexOf(c) ?? -1;
      base[c] = order[at] ?? null;
    }
  }
  // Charts with arrows that fit no size's chain belong to sizes the text doesn't describe.
  if (chains.some((ch) => ch.length > 0))
    for (const c of arrowed) if (!inChain.has(c)) chartSizes[c] = [];

  const named = new Set(base.filter((b): b is string => b !== null));
  for (const [name, w] of chartWidths(text)) {
    if (named.has(name)) continue;
    const fits = charts.flatMap((c, i) =>
      base[i] === null && !inChain.has(i) && !c.arrows?.length && c.rows[0]?.length === w
        ? [i]
        : [],
    );
    const only = fits[0];
    if (fits.length === 1 && only !== undefined) {
      base[only] = name;
      named.add(name);
    }
  }
  return { base, sizes: chartSizes, bands, arrows, chains };
}

/** "A.1 (S-M-L)": a chart's display name, with its sizes when it is drawn for some only. */
export function planName(plan: ChartPlan, index: number, sizes: readonly string[]): string | null {
  const base = plan.base[index];
  if (!base) return null;
  const own = plan.sizes[index];
  if (!own || own.length === 0) return base;
  return `${base} (${own.map((s) => sizes[s] ?? '').join('-')})`;
}
