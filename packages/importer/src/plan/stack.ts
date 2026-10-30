import type { ProjectKind } from '@kt/core';
import { descriptionBlocks } from '../describe/sections';
import type { ChartBand } from './bands';
import type { ChartPlan } from './plan';
import { textSteps, type TextStep } from './text';

/**
 * A part worked as a stack: its charts one after another, each over its own stitch count — a
 * yoke's bands between arrows, a body's motif until a length and then a border motif. Each entry
 * becomes a pattern of its own (the project groups them under the part).
 */

/** The steps of each part, from the text under its headings (part id → steps, in order). */
export function partSteps(
  text: string,
  kind: ProjectKind,
  sizeCount: number,
): Record<string, TextStep[]> {
  const out: Record<string, TextStep[]> = {};
  for (const block of descriptionBlocks(text, kind)) {
    if (block.type !== 'part' || !block.partId) continue;
    const steps = textSteps(block.text, sizeCount);
    if (steps.length > 0) out[block.partId] = [...(out[block.partId] ?? []), ...steps];
  }
  return out;
}

/** A band of a stack: rows of one or more chart bands (a band may end in one chart and go on in the next). */
export interface StackBand {
  /** Bottom first: which chart and which of its bands. */
  readonly pieces: readonly { readonly chart: number; readonly band: ChartBand }[];
  readonly width: number;
  readonly rows: number;
  /** Stitches it is worked over at the size; null when the text doesn't say. */
  readonly stitches: number | null;
  /** The arrow in its last row (its number and the stitches after it); null without one. */
  readonly arrow: {
    readonly n: number;
    readonly added: number | null;
    readonly total: number | null;
  } | null;
}

/**
 * The bands of a chain of charts at size `size`, with the stitches of each: the count before the
 * first arrow, then after each arrow what the text says. A band that goes on in the next chart
 * (same width, no arrow between) is one band.
 */
export function chainStack(plan: ChartPlan, chain: readonly number[], size: number): StackBand[] {
  const own = plan.arrows.filter((a) => a.total[size] !== null);
  const first = own[0];
  const firstTotal = first?.total[size] ?? null;
  const firstAdded = first?.added[size] ?? null;
  let stitches: number | null =
    firstTotal !== null && firstAdded !== null ? firstTotal - firstAdded : null;
  // Without the increase of the first arrow, the motif width × repeats can't be known.
  let k = 0;
  const out: StackBand[] = [];
  let open: { pieces: { chart: number; band: ChartBand }[]; width: number; rows: number } | null =
    null;
  for (const chart of chain) {
    for (const band of plan.bands[chart] ?? []) {
      const width = band.right - band.left + 1;
      const rows = band.to - band.from + 1;
      if (open && open.width === width) {
        open.pieces.push({ chart, band });
        open.rows += rows;
      } else {
        if (open) out.push({ ...open, stitches, arrow: null });
        open = { pieces: [{ chart, band }], width, rows };
      }
      if (band.arrow) {
        const a = own[k++];
        const total = a?.total[size] ?? null;
        out.push({
          ...open,
          stitches,
          arrow: a ? { n: a.n, added: a.added[size] ?? null, total } : null,
        });
        open = null;
        if (total !== null) stitches = total;
      }
    }
  }
  if (open) out.push({ ...open, stitches, arrow: null });
  return out;
}

/** The chart (index) of a step's name at a size: the one drawn for that size, else any. */
export function chartForSize(plan: ChartPlan, name: string, size: number): number | null {
  const all = plan.base.flatMap((b, i) => (b === name ? [i] : []));
  const own = all.find((i) => {
    const s = plan.sizes[i];
    return s === null || s === undefined || s.includes(size);
  });
  return own ?? null;
}
