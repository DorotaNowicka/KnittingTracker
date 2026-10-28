import { resolveSize, type SizeValue } from '../basics';
import { blankChart } from '../chart/edit';
import {
  CONTINUATION,
  type Chart,
  type ChartSegment,
  type CustomSymbol,
  type Design,
  type LegendEntry,
  type Pattern,
  type Project,
  type ProjectKind,
  type Segment,
} from '../schema/pattern';

/**
 * Authoring helpers (M3, schema v3): small pure functions used by the editor and the layout
 * wizard. They keep a project consistent while it is being built: unique ids, per-size lists that
 * always match the number of sizes, and no references to deleted charts or patterns.
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

/** A new, empty pattern: worked in the round, a start marker and no charts yet. */
export function blankPattern(id: string, name: string): Pattern {
  return {
    id,
    name: name.slice(0, 60),
    construction: 'round',
    firstRowSide: 'RS',
    charts: [],
    symbols: [],
    legend: [],
    layout: [{ kind: 'marker', id: 'start' }],
  };
}

export interface BlankProjectInput {
  readonly id: string;
  readonly name: string;
  readonly kind?: ProjectKind;
  readonly sizes?: readonly string[];
  /** Name of a first, empty pattern; omit for a project without patterns. */
  readonly patternName?: string;
  readonly now: string;
}

/** A new project, optionally with one empty pattern. */
export function blankProject(input: BlankProjectInput): Project {
  const first = input.patternName ? blankPattern('pattern-1', input.patternName) : null;
  return {
    id: input.id,
    name: input.name.slice(0, 120),
    ...(input.kind ? { kind: input.kind } : {}),
    revision: 1,
    sizes: input.sizes && input.sizes.length > 0 ? [...input.sizes] : ['1'],
    sizeIndex: 0,
    patterns: first ? [first] : [],
    ...(first ? { activePatternId: first.id } : {}),
    createdAt: input.now,
    updatedAt: input.now,
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

/**
 * Remove a chart, every placement of it and changes made to it. A layout left without segments
 * keeps a start marker.
 */
export function removeChart(pattern: Pattern, chartId: string): Pattern {
  const layout = pattern.layout.filter((seg) => seg.kind !== 'chart' || seg.chartId !== chartId);
  const modifications = (pattern.modifications ?? []).filter((m) => m.chartId !== chartId);
  const { modifications: _old, ...rest } = pattern;
  return {
    ...rest,
    charts: pattern.charts.filter((c) => c.id !== chartId),
    layout: layout.length > 0 ? layout : [{ kind: 'marker', id: 'start' } as const],
    ...(modifications.length > 0 ? { modifications } : {}),
  };
}

/** Number of placements of each chart in the pattern's layout. */
export function chartUsage(pattern: Pattern): Map<string, number> {
  const out = new Map<string, number>(pattern.charts.map((c) => [c.id, 0]));
  for (const seg of pattern.layout) {
    if (seg.kind === 'chart') out.set(seg.chartId, (out.get(seg.chartId) ?? 0) + 1);
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

/** Per-size value as stored (mutable arrays, as inferred from the schema). */
type StoredSizeValue = number | number[];

const mapSizeValue = (
  value: StoredSizeValue | undefined,
  f: (list: number[]) => number[],
): StoredSizeValue | undefined =>
  value === undefined || typeof value === 'number' ? value : f([...value]);

/**
 * A design's per-size lists after the project's sizes change. `f` is applied to the positions, so
 * each new size knows which old size it comes from; when the size the grid was drawn in goes
 * away, the per-size changes go with it (the grid stays as drawn).
 */
function mapDesignSizes(design: Design, f: (list: number[]) => number[]): Design {
  const s = design.sizes;
  if (!s) return design;
  const n = Math.max(
    s.base + 1,
    s.width?.length ?? 0,
    s.height?.length ?? 0,
    ...(s.repeats ?? []).map((r) => r.values.length),
  );
  const from = f(Array.from({ length: n }, (_, i) => i));
  const base = from.indexOf(s.base);
  if (base < 0 || from.length === 0) {
    const { sizes: _gone, ...rest } = design;
    return rest;
  }
  const remap = (list: readonly (number | null)[]) => from.map((i) => list[i] ?? null);
  return {
    ...design,
    sizes: {
      base,
      ...(s.width ? { width: remap(s.width) } : {}),
      ...(s.height ? { height: remap(s.height) } : {}),
      ...(s.repeats ? { repeats: s.repeats.map((r) => ({ ...r, values: remap(r.values) })) } : {}),
    },
  };
}

function mapPatternSizes(s: Pattern, f: (list: number[]) => number[]): Pattern {
  {
    const rows = mapSizeValue(s.rows, f);
    const expected = mapSizeValue(s.expectedStitches, f);
    const target = mapSizeValue(s.targetCm, f);
    const next: Pattern = {
      ...s,
      ...(s.design ? { design: mapDesignSizes(s.design, f) } : {}),
      layout: s.layout.map((seg) => {
        if (seg.kind !== 'chart' || seg.stitches === undefined) return seg;
        const stitches = mapSizeValue(seg.stitches, f);
        return stitches === undefined ? seg : { ...seg, stitches };
      }),
    };
    const { rows: _r, expectedStitches: _e, targetCm: _t, ...rest } = next;
    return {
      ...rest,
      ...(rows !== undefined ? { rows } : {}),
      ...(expected !== undefined ? { expectedStitches: expected } : {}),
      ...(target !== undefined ? { targetCm: target } : {}),
    };
  }
}

function mapSizeLists(project: Project, f: (list: number[]) => number[]): Project {
  return { ...project, patterns: project.patterns.map((p) => mapPatternSizes(p, f)) };
}

/** Add a size after `copyFrom` (default: last), copying that size's values. */
export function addSize(project: Project, label: string, copyFrom?: number): Project {
  const from = copyFrom ?? project.sizes.length - 1;
  const at = from + 1;
  const sizes = [...project.sizes];
  sizes.splice(at, 0, label);
  const next = mapSizeLists(project, (list) => {
    const out = [...list];
    out.splice(at, 0, list[from] ?? list[list.length - 1] ?? 0);
    return out;
  });
  const sizeIndex = project.sizeIndex >= at ? project.sizeIndex + 1 : project.sizeIndex;
  return { ...next, sizes, sizeIndex };
}

/** Remove the size at `index` (the last size can't be removed). */
export function removeSize(project: Project, index: number): Project {
  if (project.sizes.length <= 1 || index < 0 || index >= project.sizes.length) return project;
  const next = mapSizeLists(project, (list) => list.filter((_, i) => i !== index));
  const sizeIndex =
    project.sizeIndex > index || project.sizeIndex === project.sizes.length - 1
      ? Math.max(0, project.sizeIndex - 1)
      : project.sizeIndex;
  return { ...next, sizes: project.sizes.filter((_, i) => i !== index), sizeIndex };
}

export function renameSize(project: Project, index: number, label: string): Project {
  return { ...project, sizes: project.sizes.map((s, i) => (i === index ? label : s)) };
}

/**
 * A new list of sizes at once. `from[i]` is the old size the new size `i` takes its per-size
 * numbers from (a new size usually copies the one the project was drawn in).
 */
export function replaceSizes(
  project: Project,
  sizes: readonly string[],
  from: readonly number[],
  sizeIndex: number,
): Project {
  if (sizes.length === 0 || from.length !== sizes.length) return project;
  const next = mapSizeLists(project, (list) => from.map((i) => list[i] ?? list[0] ?? 0));
  return {
    ...next,
    sizes: [...sizes],
    sizeIndex: Math.max(0, Math.min(sizeIndex, sizes.length - 1)),
  };
}

/**
 * Per-size values reduced to the value of one size (a list becomes a number). Used when a
 * pattern moves to a project whose sizes do not match.
 */
export function collapseSizes(pattern: Pattern, sizeIndex: number): Pattern {
  return mapPatternSizes(pattern, (list) => {
    const v = list[sizeIndex] ?? list[0] ?? 0;
    return list.map(() => v);
  });
}

// ── Patterns of a project ─────────────────────────────────────────────────────────────────

export function updatePattern(project: Project, pattern: Pattern): Project {
  return { ...project, patterns: project.patterns.map((s) => (s.id === pattern.id ? pattern : s)) };
}

/** Change one pattern of a project with a function (no-op when the id is unknown). */
export function mapPattern(
  project: Project,
  patternId: string,
  change: (pattern: Pattern) => Pattern,
): Project {
  const current = project.patterns.find((p) => p.id === patternId);
  if (!current) return project;
  const next = change(current);
  return next === current ? project : updatePattern(project, next);
}

/** Append a pattern (its id made unique in the project). */
export function insertPattern(
  project: Project,
  pattern: Pattern,
  at: number = project.patterns.length,
): { project: Project; patternId: string } {
  const patternId = uniqueId(
    pattern.id,
    project.patterns.map((p) => p.id),
    'pattern',
  );
  const patterns = [...project.patterns];
  patterns.splice(Math.max(0, Math.min(at, patterns.length)), 0, { ...pattern, id: patternId });
  return {
    project: {
      ...project,
      patterns,
      ...(project.activePatternId ? {} : { activePatternId: patternId }),
    },
    patternId,
  };
}

export function addPattern(
  project: Project,
  name: string,
): { project: Project; patternId: string } {
  return insertPattern(project, blankPattern(uniqueId(name, [], 'pattern'), name));
}

/**
 * Remove a pattern. Placements that continued its chart rows keep their place but lose the link
 * (they start at their own start row again). Its finished-row record goes too.
 */
export function removePattern(project: Project, patternId: string): Project {
  const patterns = project.patterns
    .filter((s) => s.id !== patternId)
    .map((s) => ({
      ...s,
      layout: s.layout.map((seg) => {
        if (seg.kind !== 'chart' || seg.continueFrom?.patternId !== patternId) return seg;
        const { continueFrom: _dropped, ...rest } = seg;
        return rest;
      }),
    }));
  const { activePatternId: _a, finishedRows: _f, ...base } = project;
  const finished = Object.fromEntries(
    Object.entries(project.finishedRows ?? {}).filter(([id]) => id !== patternId),
  );
  const active =
    project.activePatternId && project.activePatternId !== patternId
      ? project.activePatternId
      : patterns[0]?.id;
  return {
    ...base,
    patterns,
    ...(active ? { activePatternId: active } : {}),
    ...(Object.keys(finished).length > 0 ? { finishedRows: finished } : {}),
  };
}

/** Move a pattern to another position (the order the knitter works them). */
export function movePattern(project: Project, from: number, to: number): Project {
  return { ...project, patterns: moveItem(project.patterns, from, to) };
}

/** A copy of a pattern under a new name, right after it (no progress, same continuations). */
export function duplicatePattern(
  project: Project,
  patternId: string,
  name: string,
): { project: Project; patternId: string } {
  const index = project.patterns.findIndex((s) => s.id === patternId);
  const source = project.patterns[index];
  if (!source) throw new Error(`Unknown pattern: ${patternId}`);
  return insertPattern(
    project,
    { ...source, id: uniqueId(name, [], 'pattern'), name: name.slice(0, 60) },
    index + 1,
  );
}

/**
 * Change of layout from a given row (FR-14), or the next part of the garment: a new pattern right
 * after `patternId` with the same charts and layout, whose placements continue the chart rows
 * where that pattern ends (DR-3). The knitter then edits widths, removes charts (e.g. the back
 * after a split) or switches to flat knitting. The new pattern is open-ended until rows are set.
 */
export function continuePattern(
  project: Project,
  patternId: string,
  name: string,
): { project: Project; patternId: string } {
  const index = project.patterns.findIndex((s) => s.id === patternId);
  const source = project.patterns[index];
  if (!source) throw new Error(`Unknown pattern: ${patternId}`);
  const layout: Segment[] = source.layout.map((seg) => {
    if (seg.kind === 'marker') return seg;
    const { rowOffset: _offset, continueFrom: _from, ...rest } = seg;
    return { ...rest, continueFrom: { patternId: source.id, placementId: seg.placementId } };
  });
  const pattern: Pattern = {
    id: uniqueId(name, [], 'pattern'),
    name: name.slice(0, 60),
    construction: source.construction,
    firstRowSide: source.firstRowSide,
    charts: source.charts,
    symbols: source.symbols,
    legend: source.legend,
    layout,
    ...(source.tracking ? { tracking: source.tracking } : {}),
    ...(source.modifications ? { modifications: source.modifications } : {}),
  };
  return insertPattern(project, pattern, index + 1);
}

/**
 * A pattern of one project prepared for another (patterns belong to their project; reuse is by
 * copying): links to other patterns are dropped, and when the sizes differ, per-size numbers are
 * reduced to the source project's chosen size.
 */
export function patternForProject(
  source: Pick<Project, 'sizes' | 'sizeIndex'>,
  pattern: Pattern,
  target: Pick<Project, 'sizes'>,
): Pattern {
  const layout = pattern.layout.map((seg) => {
    if (seg.kind !== 'chart' || !seg.continueFrom) return seg;
    const { continueFrom: _from, ...rest } = seg;
    return rest;
  });
  const sameSizes =
    source.sizes.length === target.sizes.length &&
    source.sizes.every((s, i) => s === target.sizes[i]);
  const copy = { ...pattern, layout };
  return sameSizes ? copy : collapseSizes(copy, source.sizeIndex);
}

const segmentId = (seg: Segment) => (seg.kind === 'chart' ? seg.placementId : seg.id);

/** `<base>-<n>` with the smallest n ≥ 1 that is not taken. */
function nextNumbered(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** A new chart placement with a unique placement id (`<chart>-<n>`). */
export function newChartSegment(pattern: Pattern, chart: Chart): ChartSegment {
  return {
    kind: 'chart',
    placementId: nextNumbered(chart.id, pattern.layout.map(segmentId)),
    chartId: chart.id,
  };
}

export function newMarker(pattern: Pattern, sectionName?: string): Segment {
  const id = nextNumbered('marker', pattern.layout.map(segmentId));
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

/** Ids of all symbols used in the pattern's charts (and changed charts), in order of appearance. */
export function usedSymbolIds(pattern: Pattern): string[] {
  const seen = new Set<string>();
  for (const chart of [...pattern.charts, ...(pattern.modifications ?? []).map((m) => m.chart)]) {
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
  /** Fields left out keep their value; an empty one is removed. */
  entry: { readonly number?: string; readonly text?: string; readonly name?: string },
): Pattern {
  const old = pattern.legend.find((e) => e.symbolId === symbolId);
  const number = (entry.number ?? old?.number ?? '').trim();
  const text = (entry.text ?? old?.text ?? '').trim();
  const name = (entry.name ?? old?.name ?? '').trim().slice(0, 80);
  const rest = pattern.legend.filter((e) => e.symbolId !== symbolId);
  if (!number && !text && !name) return { ...pattern, legend: rest };
  const next: LegendEntry = {
    symbolId,
    ...(number ? { number } : {}),
    ...(text ? { text } : {}),
    ...(name ? { name } : {}),
  };
  const index = pattern.legend.findIndex((e) => e.symbolId === symbolId);
  const legend = [...rest];
  legend.splice(index < 0 ? legend.length : index, 0, next);
  return { ...pattern, legend };
}

/**
 * What a symbol is called in this pattern: the knitter's own name, else the pattern's wording
 * (from the file's legend), else the symbol's standard label.
 */
export function legendLabel(
  pattern: Pick<Pattern, 'legend'>,
  symbol: { readonly id: string; readonly label: { readonly pl: string; readonly en: string } },
  lang: 'pl' | 'en',
): string {
  const entry = pattern.legend.find((e) => e.symbolId === symbol.id);
  return entry?.name || entry?.text || symbol.label[lang];
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
