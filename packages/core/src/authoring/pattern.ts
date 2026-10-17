import { resolveSize, type SizeValue } from '../basics';
import { blankChart } from '../chart/edit';
import {
  CONTINUATION,
  type Chart,
  type ChartSegment,
  type CustomSymbol,
  type LegendEntry,
  type Pattern,
  type Segment,
  type Stage,
} from '../schema/pattern';

/**
 * Pattern authoring helpers (M3): small pure functions used by the editor and the layout wizard.
 * They keep a pattern consistent while it is being built: unique ids, per-size lists that always
 * match the number of sizes, and no references to deleted charts.
 */

/** A readable, unique id derived from a name: "A.1" → "a-1", "A.1" again → "a-1-2". */
export function uniqueId(name: string, taken: Iterable<string>, fallback = 'item'): string {
  const used = new Set(taken);
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || fallback;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!used.has(id)) return id;
  }
}

export interface BlankPatternInput {
  readonly id: string;
  readonly title: string;
  readonly sizes: readonly string[];
  readonly stageName: string;
}

/** A new, empty pattern: one round stage with a start marker and no charts yet. */
export function blankPattern(input: BlankPatternInput): Pattern {
  return {
    id: input.id,
    revision: 1,
    title: input.title,
    sizes: input.sizes.length > 0 ? [...input.sizes] : ['1'],
    symbols: [],
    legend: [],
    charts: [],
    stages: [
      {
        id: 'stage-1',
        name: input.stageName,
        construction: 'round',
        firstRowSide: 'RS',
        layout: [{ kind: 'marker', id: 'start' }],
      },
    ],
  };
}

// ── Charts ────────────────────────────────────────────────────────────────────────────────

export function addChart(
  pattern: Pattern,
  name: string,
  width: number,
  height: number,
  fill?: string,
): { pattern: Pattern; chartId: string } {
  const chartId = uniqueId(
    name,
    pattern.charts.map((c) => c.id),
    'chart',
  );
  const chart = blankChart({ id: chartId, name }, width, height, fill);
  return { pattern: { ...pattern, charts: [...pattern.charts, chart] }, chartId };
}

export function updateChart(pattern: Pattern, chart: Chart): Pattern {
  return { ...pattern, charts: pattern.charts.map((c) => (c.id === chart.id ? chart : c)) };
}

export function duplicateChart(
  pattern: Pattern,
  chartId: string,
  name: string,
): { pattern: Pattern; chartId: string } {
  const source = pattern.charts.find((c) => c.id === chartId);
  if (!source) return { pattern, chartId };
  const id = uniqueId(
    name,
    pattern.charts.map((c) => c.id),
    'chart',
  );
  return {
    pattern: { ...pattern, charts: [...pattern.charts, { ...source, id, name }] },
    chartId: id,
  };
}

/** Remove a chart and every placement of it. A stage left without segments keeps a start marker. */
export function removeChart(pattern: Pattern, chartId: string): Pattern {
  return {
    ...pattern,
    charts: pattern.charts.filter((c) => c.id !== chartId),
    stages: pattern.stages.map((s) => {
      const layout = s.layout.filter((seg) => seg.kind !== 'chart' || seg.chartId !== chartId);
      return {
        ...s,
        layout: layout.length > 0 ? layout : [{ kind: 'marker', id: 'start' } as const],
      };
    }),
  };
}

/** Number of placements of each chart across all stages. */
export function chartUsage(pattern: Pattern): Map<string, number> {
  const out = new Map<string, number>(pattern.charts.map((c) => [c.id, 0]));
  for (const s of pattern.stages) {
    for (const seg of s.layout) {
      if (seg.kind === 'chart') out.set(seg.chartId, (out.get(seg.chartId) ?? 0) + 1);
    }
  }
  return out;
}

// ── Sizes ─────────────────────────────────────────────────────────────────────────────────

/** Value of a per-size number for one size, or `undefined` when unset / out of range. */
export function sizeValueAt(value: SizeValue | undefined, sizeIndex: number): number | undefined {
  if (value === undefined) return undefined;
  try {
    return resolveSize(value, sizeIndex);
  } catch {
    return undefined;
  }
}

/** True when a per-size value is the same for all sizes. */
export const isUniform = (value: SizeValue | undefined): boolean =>
  value === undefined || typeof value === 'number' || value.every((v) => v === value[0]);

/**
 * Set the value for one size. A uniform value becomes a list first; a list whose entries end up
 * equal stays a list (the author chose per-size values on purpose).
 */
export function setSizeValue(
  value: SizeValue | undefined,
  sizeIndex: number,
  next: number,
  sizeCount: number,
): number[] {
  const list = Array.from({ length: sizeCount }, (_, i) => sizeValueAt(value, i) ?? next);
  list[sizeIndex] = next;
  return list;
}

/** Per-size value as stored in a pattern (mutable arrays, as inferred from the schema). */
type StoredSizeValue = number | number[];

const mapSizeValue = (
  value: StoredSizeValue | undefined,
  f: (list: number[]) => number[],
): StoredSizeValue | undefined =>
  value === undefined || typeof value === 'number' ? value : f([...value]);

function mapSizeLists(pattern: Pattern, f: (list: number[]) => number[]): Pattern {
  const stage = (s: Stage): Stage => {
    const rows = mapSizeValue(s.rows, f);
    const expected = mapSizeValue(s.expectedStitches, f);
    const next: Stage = {
      ...s,
      layout: s.layout.map((seg) => {
        if (seg.kind !== 'chart' || seg.stitches === undefined) return seg;
        const stitches = mapSizeValue(seg.stitches, f);
        return stitches === undefined ? seg : { ...seg, stitches };
      }),
    };
    const { rows: _r, expectedStitches: _e, ...rest } = next;
    return {
      ...rest,
      ...(rows !== undefined ? { rows } : {}),
      ...(expected !== undefined ? { expectedStitches: expected } : {}),
    };
  };
  return { ...pattern, stages: pattern.stages.map(stage) };
}

/** Add a size after `copyFrom` (default: last), copying that size's values. */
export function addSize(pattern: Pattern, label: string, copyFrom?: number): Pattern {
  const from = copyFrom ?? pattern.sizes.length - 1;
  const at = from + 1;
  const sizes = [...pattern.sizes];
  sizes.splice(at, 0, label);
  const next = mapSizeLists(pattern, (list) => {
    const out = [...list];
    out.splice(at, 0, list[from] ?? list[list.length - 1] ?? 0);
    return out;
  });
  return { ...next, sizes };
}

/** Remove the size at `index` (the last size can't be removed). */
export function removeSize(pattern: Pattern, index: number): Pattern {
  if (pattern.sizes.length <= 1 || index < 0 || index >= pattern.sizes.length) return pattern;
  const next = mapSizeLists(pattern, (list) => list.filter((_, i) => i !== index));
  return { ...next, sizes: pattern.sizes.filter((_, i) => i !== index) };
}

export function renameSize(pattern: Pattern, index: number, label: string): Pattern {
  return { ...pattern, sizes: pattern.sizes.map((s, i) => (i === index ? label : s)) };
}

// ── Stages and layout ─────────────────────────────────────────────────────────────────────

export function updateStage(pattern: Pattern, stage: Stage): Pattern {
  return { ...pattern, stages: pattern.stages.map((s) => (s.id === stage.id ? stage : s)) };
}

export function addStage(pattern: Pattern, name: string): { pattern: Pattern; stageId: string } {
  const stageId = uniqueId(
    name,
    pattern.stages.map((s) => s.id),
    'stage',
  );
  const stage: Stage = {
    id: stageId,
    name,
    construction: 'round',
    firstRowSide: 'RS',
    layout: [{ kind: 'marker', id: 'start' }],
  };
  return { pattern: { ...pattern, stages: [...pattern.stages, stage] }, stageId };
}

/**
 * Remove a stage. Placements that continued its chart rows keep their place but lose the link
 * (they start at their own start row again).
 */
export function removeStage(pattern: Pattern, stageId: string): Pattern {
  if (pattern.stages.length <= 1) return pattern;
  return {
    ...pattern,
    stages: pattern.stages
      .filter((s) => s.id !== stageId)
      .map((s) => ({
        ...s,
        layout: s.layout.map((seg) => {
          if (seg.kind !== 'chart' || seg.continueFrom?.stageId !== stageId) return seg;
          const { continueFrom: _dropped, ...rest } = seg;
          return rest;
        }),
      })),
  };
}

/** Move a stage to another position in the stage list (the order the knitter works them). */
export function moveStage(pattern: Pattern, from: number, to: number): Pattern {
  return { ...pattern, stages: moveItem(pattern.stages, from, to) };
}

/**
 * Change of layout from a given row (FR-14), or the next part of the garment: a new stage right
 * after `stageId` with the same layout, whose chart placements continue the chart rows where
 * that stage ends (DR-3). The knitter then edits widths, removes charts (e.g. the back after a
 * split) or switches to flat knitting. The new stage is open-ended until rows are set.
 */
export function continueStage(
  pattern: Pattern,
  stageId: string,
  name: string,
): { pattern: Pattern; stageId: string } {
  const index = pattern.stages.findIndex((s) => s.id === stageId);
  const source = pattern.stages[index];
  if (!source) throw new Error(`Unknown stage: ${stageId}`);
  const id = uniqueId(
    name,
    pattern.stages.map((s) => s.id),
    'stage',
  );
  const layout: Segment[] = source.layout.map((seg) => {
    if (seg.kind === 'marker') return seg;
    const { rowOffset: _offset, continueFrom: _from, ...rest } = seg;
    return { ...rest, continueFrom: { stageId: source.id, placementId: seg.placementId } };
  });
  const stage: Stage = {
    id,
    name,
    construction: source.construction,
    firstRowSide: source.firstRowSide,
    layout,
    ...(source.tracking ? { tracking: source.tracking } : {}),
  };
  const stages = [...pattern.stages];
  stages.splice(index + 1, 0, stage);
  return { pattern: { ...pattern, stages }, stageId: id };
}

const segmentId = (seg: Segment) => (seg.kind === 'chart' ? seg.placementId : seg.id);

/** `<base>-<n>` with the smallest n ≥ 1 that is not taken. */
function nextNumbered(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** A new chart placement with a unique placement id (`<chart>-<n>`). */
export function newChartSegment(stage: Stage, chart: Chart): ChartSegment {
  return {
    kind: 'chart',
    placementId: nextNumbered(chart.id, stage.layout.map(segmentId)),
    chartId: chart.id,
  };
}

export function newMarker(stage: Stage, sectionName?: string): Segment {
  const id = nextNumbered('marker', stage.layout.map(segmentId));
  return sectionName ? { kind: 'marker', id, sectionName } : { kind: 'marker', id };
}

/** Move an item from one index to another (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  if (item === undefined) return out;
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

// ── Symbols and legend ────────────────────────────────────────────────────────────────────

/** Ids of all symbols used in the pattern's charts, in order of first appearance. */
export function usedSymbolIds(pattern: Pattern): string[] {
  const seen = new Set<string>();
  for (const chart of pattern.charts) {
    for (const row of chart.rows) {
      for (const ch of row) {
        if (ch === CONTINUATION) continue;
        const id = chart.palette[ch];
        if (id) seen.add(id);
      }
    }
  }
  return [...seen];
}

/** Set (or clear, when both fields are empty) the pattern's own legend entry for a symbol. */
export function setLegendEntry(
  pattern: Pattern,
  symbolId: string,
  entry: { readonly number?: string; readonly text?: string },
): Pattern {
  const number = entry.number?.trim() ?? '';
  const text = entry.text?.trim() ?? '';
  const rest = pattern.legend.filter((e) => e.symbolId !== symbolId);
  if (!number && !text) return { ...pattern, legend: rest };
  const next: LegendEntry = {
    symbolId,
    ...(number ? { number } : {}),
    ...(text ? { text } : {}),
  };
  const index = pattern.legend.findIndex((e) => e.symbolId === symbolId);
  const legend = [...rest];
  legend.splice(index < 0 ? legend.length : index, 0, next);
  return { ...pattern, legend };
}

export function upsertCustomSymbol(pattern: Pattern, symbol: CustomSymbol): Pattern {
  const exists = pattern.symbols.some((s) => s.id === symbol.id);
  return {
    ...pattern,
    symbols: exists
      ? pattern.symbols.map((s) => (s.id === symbol.id ? symbol : s))
      : [...pattern.symbols, symbol],
  };
}

/** Remove a custom symbol; refused (returns `null`) while a chart still uses it. */
export function removeCustomSymbol(pattern: Pattern, symbolId: string): Pattern | null {
  if (usedSymbolIds(pattern).includes(symbolId)) return null;
  return {
    ...pattern,
    symbols: pattern.symbols.filter((s) => s.id !== symbolId),
    legend: pattern.legend.filter((e) => e.symbolId !== symbolId),
  };
}

export function customSymbolId(name: string, pattern: Pattern): string {
  const taken = pattern.symbols.map((s) => s.id.replace(/^user:/, ''));
  return `user:${uniqueId(name, taken, 'symbol')}`;
}
