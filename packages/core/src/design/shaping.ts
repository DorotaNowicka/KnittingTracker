import { repairRows } from '../chart/edit';
import type { Design, ShapingRule } from '../schema/pattern';
import { STD } from '../symbols/library';
import type { SymbolRegistry } from '../symbols/registry';

/**
 * Shaping of a creator design (decreases and increases at the edges or the sides). The grid is
 * as wide as the widest row: each place where stitches are added has that many spare columns
 * ("allowance"), "no stitch" until the increases reach them; decreases turn columns into "no
 * stitch" from the outside in. The pattern stays in its columns, so it never shifts sideways.
 */

/** A place where the shape changes: one end of the grid or of one of its halves. */
export interface ShapingSite {
  readonly id: 'R' | 'L' | 'fR' | 'fL' | 'bR' | 'bL';
  /** Index of the region (0 = the whole grid or the front, 1 = the back). */
  readonly region: number;
  /** Which end of the region, in the RS view. */
  readonly end: 'right' | 'left';
  /** An edge of the grid (not the line between the halves). */
  readonly edge: boolean;
}

const halved = (design: Pick<Design, 'width' | 'halves'>) => !!design.halves && design.width >= 2;
const frontWidth = (width: number) => Math.ceil(width / 2);

/** The regions shaped on their own, counted from the right edge: the halves, or the whole grid. */
export function shapingRegions(design: Pick<Design, 'width' | 'halves'>) {
  const w = design.width;
  if (!halved(design)) return [{ start: 1, end: w }];
  const fh = frontWidth(w);
  return [
    { start: 1, end: fh },
    { start: fh + 1, end: w },
  ];
}

export function shapingSites(design: Pick<Design, 'width' | 'halves'>): ShapingSite[] {
  if (!halved(design))
    return [
      { id: 'R', region: 0, end: 'right', edge: true },
      { id: 'L', region: 0, end: 'left', edge: true },
    ];
  return [
    { id: 'fR', region: 0, end: 'right', edge: true },
    { id: 'fL', region: 0, end: 'left', edge: false },
    { id: 'bR', region: 1, end: 'right', edge: false },
    { id: 'bL', region: 1, end: 'left', edge: true },
  ];
}

/** Rows (from 1) where a rule changes the shape, within the grid's height. */
export function ruleRows(rule: ShapingRule, height: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < rule.times; k++) {
    const row = rule.start + k * rule.every;
    if (row > height) break;
    out.push(row);
  }
  return out;
}

/** Places a rule works at: both edges, or every side (in a design not split, the edges). */
const applies = (rule: ShapingRule, site: ShapingSite) => rule.where === 'sides' || site.edge;

interface SiteEvent {
  readonly sign: 1 | -1;
  readonly symbol: string;
  readonly inset: number;
}

/** For every site, the shape changes of each row (index = row). */
function siteEvents(
  design: Design,
  rules: readonly ShapingRule[],
): Map<ShapingSite['id'], SiteEvent[][]> {
  const sites = shapingSites(design);
  const out = new Map(
    sites.map((s) => [s.id, Array.from({ length: design.height + 1 }, () => [] as SiteEvent[])]),
  );
  for (const rule of rules) {
    for (const site of sites) {
      if (!applies(rule, site)) continue;
      const list = out.get(site.id);
      for (const row of ruleRows(rule, design.height)) {
        list?.[row]?.push({
          sign: rule.kind === 'increase' ? 1 : -1,
          symbol: site.end === 'right' ? rule.right : rule.left,
          inset: rule.inset,
        });
      }
    }
  }
  return out;
}

const sum = (list: readonly SiteEvent[]) => list.reduce((n, e) => n + e.sign, 0);

/** Spare columns each site needs for its increases: the most stitches it gains at any row. */
function allowancesOf(
  design: Design,
  rules: readonly ShapingRule[],
): Map<ShapingSite['id'], number> {
  const events = siteEvents(design, rules);
  const out = new Map<ShapingSite['id'], number>();
  for (const [id, rows] of events) {
    let cum = 0;
    let most = 0;
    for (const e of rows) {
      cum += sum(e);
      most = Math.max(most, cum);
    }
    out.set(id, most);
  }
  return out;
}

/** Stitches on the needles before the first row: the grid's width without the spare columns. */
export function startStitches(design: Design): number {
  const spare = [...allowancesOf(design, design.shaping ?? []).values()];
  return design.width - spare.reduce((a, b) => a + b, 0);
}

/**
 * For each region and row, how many columns at its right and left end are "no stitch" (row 1
 * first). The spare columns count as "no stitch" until increases reach them.
 */
function offsets(design: Design) {
  const rules = design.shaping ?? [];
  const events = siteEvents(design, rules);
  const spare = allowancesOf(design, rules);
  const sites = shapingSites(design);
  return shapingRegions(design).map((region, k) => {
    const right = sites.find((s) => s.region === k && s.end === 'right');
    const left = sites.find((s) => s.region === k && s.end === 'left');
    const er = right ? (events.get(right.id) ?? []) : [];
    const el = left ? (events.get(left.id) ?? []) : [];
    let cumR = 0;
    let cumL = 0;
    const rows: { right: number; left: number; er: SiteEvent[]; el: SiteEvent[] }[] = [];
    for (let r = 1; r <= design.height; r++) {
      cumR += sum(er[r] ?? []);
      cumL += sum(el[r] ?? []);
      rows.push({
        right: (right ? (spare.get(right.id) ?? 0) : 0) - cumR,
        left: (left ? (spare.get(left.id) ?? 0) : 0) - cumL,
        er: er[r] ?? [],
        el: el[r] ?? [],
      });
    }
    return { region, rows };
  });
}

/** Stitches in each row (row 1 first) after the shaping. */
export function stitchesPerRow(design: Design): number[] {
  const regions = offsets(design);
  return Array.from({ length: design.height }, (_, i) =>
    regions.reduce((n, { region, rows }) => {
      const o = rows[i];
      const width = region.end - region.start + 1;
      return n + (o ? Math.max(0, width - o.right - o.left) : width);
    }, 0),
  );
}

/**
 * Composed rows (row 1 first, RS view left → right) with the shaping applied: "no stitch" where
 * the shape is narrower, and the rule's symbols `inset` stitches in from the edge or side line in
 * the rows where the shape changes. Symbols cut by the change become knit.
 */
export function shapeRows(
  rows: readonly (readonly string[])[],
  design: Design,
  registry: SymbolRegistry,
): string[][] {
  if (!design.shaping?.length) return rows.map((r) => [...r]);
  const out = rows.map((r) => [...r]);
  const w = design.width;
  for (const { region, rows: shape } of offsets(design)) {
    // Display columns (0-based) of the region: its right end is stitch `start` from the right.
    const a = w - region.end;
    const n = region.end - region.start + 1;
    shape.forEach((o, i) => {
      const row = out[i];
      if (!row) return;
      for (let local = 0; local < n; local++) {
        if (local < o.left || local > n - 1 - o.right) row[a + local] = STD.noStitch;
      }
      o.er.forEach((e, m) => {
        const local = n - 1 - (o.right + e.inset + m);
        if (local >= o.left && local <= n - 1 - o.right) row[a + local] = e.symbol;
      });
      o.el.forEach((e, m) => {
        const local = o.left + e.inset + m;
        if (local >= o.left && local <= n - 1 - o.right) row[a + local] = e.symbol;
      });
    });
  }
  return repairRows(out, registry);
}

/**
 * The design with new shaping rules. Spare columns for increases are added or taken away at each
 * place, so the stitches on the needles at the start stay the same and every tile and brush
 * stitch keeps its place in the pattern. A tile running to the edge from the start of the grid
 * (or of the back) keeps its rhythm. Returns the design unchanged when the grid would get wider
 * than 1000 stitches.
 */
export function withShaping(design: Design, rules: readonly ShapingRule[]): Design {
  const { shaping: _old, ...plain } = design;
  const next: Design = rules.length > 0 ? { ...plain, shaping: [...rules] } : plain;
  const before = allowancesOf(design, design.shaping ?? []);
  const after = allowancesOf(design, rules);
  const delta = (id: ShapingSite['id']) => (after.get(id) ?? 0) - (before.get(id) ?? 0);
  const total = shapingSites(design).reduce((n, s) => n + delta(s.id), 0);
  const width = design.width + total;
  if (width < 1 || width > 1000) return design;
  const split = halved(design);
  const fhOld = frontWidth(design.width);
  const fhNew = fhOld + (split ? delta('fR') + delta('fL') : 0);
  const shift = (col: number) =>
    !split ? delta('R') : col <= fhOld ? delta('fR') : delta('fR') + delta('fL') + delta('bR');
  const startOld = (col: number) => (split && col > fhOld ? fhOld + 1 : 1);
  const startNew = (col: number) => (split && col > fhOld ? fhNew + 1 : 1);
  const placements = design.placements.map((p) => {
    const moved = p.col + shift(p.col);
    const motif = design.motifs.find((m) => m.id === p.motifId);
    if (p.repeatX !== 'fill' || p.col !== startOld(p.col) || !motif) return { ...p, col: moved };
    const start = startNew(p.col);
    const phase = (((moved - start) % motif.width) + motif.width) % motif.width;
    return { ...p, col: start + phase };
  });
  const cells = design.cells.map((c) => ({ ...c, col: c.col + shift(c.col) }));
  return { ...next, width, placements, cells };
}

/**
 * Bound-off stitches are gone: every cell above a "bind off" in its column is "no stitch". Cells
 * below are left as they are.
 */
export function boundOffAbove(rows: readonly (readonly string[])[]): string[][] {
  const out = rows.map((r) => [...r]);
  const width = Math.max(0, ...out.map((r) => r.length));
  for (let c = 0; c < width; c++) {
    let gone = false;
    for (const row of out) {
      if (gone && c < row.length) row[c] = STD.noStitch;
      else if (row[c] === STD.bindOff) gone = true;
    }
  }
  return out;
}

/** A row whose stitches don't add up with the row below. */
export interface BalanceProblem {
  /** Row (from 1). */
  readonly row: number;
  /**
   * Stitches the row takes minus those the row below leaves: positive when a decrease has no
   * "no stitch" next to it, negative when an increase has none below it.
   */
  readonly diff: number;
}

const CONT = '.';

/** What a row takes from the needles and what it leaves on them. */
function flowOf(row: readonly string[], registry: SymbolRegistry) {
  let takes = 0;
  let leaves = 0;
  for (const id of row) {
    if (id === CONT) continue;
    const s = registry.get(id);
    takes += s ? s.consumes : 1;
    leaves += s ? s.produces : 1;
  }
  return { takes, leaves };
}

/**
 * Rows that take a different number of stitches than the row below left, e.g. "2 together"
 * painted with the brush without a "no stitch" for the stitch it takes away. Lace (a yarn over
 * for each decrease) adds up.
 */
export function stitchBalance(
  rows: readonly (readonly string[])[],
  registry: SymbolRegistry,
): BalanceProblem[] {
  const out: BalanceProblem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const below = flowOf(rows[i - 1] ?? [], registry);
    const here = flowOf(rows[i] ?? [], registry);
    if (here.takes !== below.leaves) out.push({ row: i + 1, diff: here.takes - below.leaves });
  }
  return out;
}

/** Decreases leaning right (the stitch on their left goes on top and disappears there). */
const LEANS_RIGHT = new Set<string>([STD.k2tog, STD.p2tog]);

/**
 * The design with "no stitch" brush cells that make a row add up: next to a decrease, on the side
 * it leans towards, from that row up; below an increase, under it. Works on the shaped grid as
 * shown (`rows`, row 1 first, RS view left → right). Unchanged when there is nothing to fix.
 */
export function fixBalance(
  design: Design,
  rows: readonly (readonly string[])[],
  registry: SymbolRegistry,
  problem: BalanceProblem,
): Design {
  const row = rows[problem.row - 1];
  if (!row) return design;
  const w = design.width;
  const targets: { col: number; from: number; to: number }[] = [];
  const free = (c: number) => c >= 0 && c < row.length && row[c] !== STD.noStitch;
  for (let c = 0; c < row.length && targets.length < Math.abs(problem.diff); c++) {
    const s = registry.get(row[c] ?? '');
    if (!s) continue;
    if (problem.diff > 0 && s.consumes > s.produces) {
      const order = LEANS_RIGHT.has(s.id) ? [c - 1, c + 1] : [c + 1, c - 1];
      const side = order.find((x) => free(x) && registry.get(row[x] ?? '')?.family === 'basic');
      if (side !== undefined) targets.push({ col: side, from: problem.row, to: design.height });
    } else if (problem.diff < 0 && s.produces > s.consumes && problem.row > 1) {
      targets.push({ col: c, from: 1, to: problem.row - 1 });
    }
  }
  if (targets.length === 0) return design;
  const added = targets.flatMap(({ col, from, to }) =>
    Array.from({ length: to - from + 1 }, (_, k) => ({
      row: from + k,
      col: w - col,
      symbolId: STD.noStitch,
    })),
  );
  const taken = new Set(added.map((c) => `${c.row}:${c.col}`));
  return {
    ...design,
    cells: [...design.cells.filter((c) => !taken.has(`${c.row}:${c.col}`)), ...added],
  };
}
