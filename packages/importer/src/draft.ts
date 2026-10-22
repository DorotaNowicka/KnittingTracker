import {
  applySymbolRows,
  blankChart,
  sizeValueAt,
  uniqueId,
  type Chart,
  type ChartSegment,
  type LegendEntry,
  type Pattern,
  type Project,
  type Segment,
  type SymbolRows,
} from '@kt/core';

/**
 * Turn a verified import into a pattern (and, for a new project, the project around it): FR-1,
 * last step before the layout wizard. Pure: the web app passes what the user confirmed on the
 * verification screen.
 */
export interface DraftChart {
  readonly name: string;
  /** Symbol grid, rows bottom → top (as confirmed by the user). */
  readonly rows: SymbolRows;
}

export interface DraftInput {
  /** Pattern id (made unique when the pattern joins a project). */
  readonly id: string;
  /** Pattern name, e.g. "Korpus". */
  readonly name: string;
  /** Sizes of the project the pattern is for; per-size numbers follow this list. */
  readonly sizes: readonly string[];
  readonly charts: readonly DraftChart[];
  readonly legend: readonly LegendEntry[];
  /** Chart order of a round from the description; names refer to `charts[].name`. */
  readonly sequence?: readonly { readonly chart: string; readonly stitches?: readonly number[] }[];
  /** Stitches of the round per size, as stated by the pattern. */
  readonly stitchCount?: readonly number[];
  /** Stitches before the side marker, per size. */
  readonly marker?: readonly number[];
  /** Names of the two halves when a side marker is placed (e.g. Przód, Tył). */
  readonly sectionNames?: readonly [string, string];
}

/** Stitches each segment covers, per size (marker = 0). */
function widths(
  layout: readonly Segment[],
  charts: ReadonlyMap<string, Chart>,
  sizes: number,
): number[][] {
  return layout.map((seg) => {
    if (seg.kind === 'marker') return Array<number>(sizes).fill(0);
    const w = charts.get(seg.chartId)?.width ?? 0;
    return Array.from({ length: sizes }, (_, i) => sizeValueAt(seg.stitches, i) ?? w);
  });
}

/**
 * Put a marker after `at[size]` stitches. At a segment boundary it is inserted; inside a segment
 * with per-size stitches (e.g. a filler "over 37-43 stitches") the segment is split in two. If the
 * marker falls in different segments for different sizes, nothing is changed.
 */
export function placeMarker(
  layout: readonly Segment[],
  charts: ReadonlyMap<string, Chart>,
  sizes: number,
  at: readonly number[],
  marker: Segment,
): Segment[] | null {
  const w = widths(layout, charts, sizes);
  let index: number | null = null;
  const offsets: number[] = [];
  for (let s = 0; s < sizes; s++) {
    const target = at[s] ?? 0;
    let acc = 0;
    let found: { index: number; offset: number } | null = null;
    for (let i = 0; i < layout.length; i++) {
      const len = w[i]?.[s] ?? 0;
      if (len > 0 && target > acc && target < acc + len) {
        found = { index: i, offset: target - acc };
        break;
      }
      if (target === acc + len && len > 0) {
        found = { index: i + 1, offset: 0 };
        break;
      }
      acc += len;
    }
    if (!found) return null;
    if (index !== null && index !== found.index) return null;
    index = found.index;
    offsets.push(found.offset);
  }
  if (index === null) return null;
  if (offsets.every((o) => o === 0))
    return [...layout.slice(0, index), marker, ...layout.slice(index)];
  if (offsets.some((o) => o === 0)) return null;
  const seg = layout[index];
  if (!seg || seg.kind !== 'chart' || seg.stitches === undefined) return null;
  const total = w[index] ?? [];
  const first: ChartSegment = { ...seg, placementId: `${seg.placementId}-a`, stitches: offsets };
  // The second part continues the repeat where the first stopped (start column follows).
  const chart = charts.get(seg.chartId);
  const startColumn = seg.startColumn ?? chart?.width ?? 1;
  const next = chart
    ? ((((startColumn - 1 - (offsets[0] ?? 0)) % chart.width) + chart.width) % chart.width) + 1
    : startColumn;
  const sameShift = chart
    ? offsets.every((o) => (o - (offsets[0] ?? 0)) % chart.width === 0)
    : true;
  if (!sameShift) return null;
  const { startColumn: _old, ...rest } = seg;
  const second: ChartSegment = {
    ...rest,
    placementId: `${seg.placementId}-b`,
    stitches: total.map((t, s) => t - (offsets[s] ?? 0)),
    ...(chart && next !== chart.width ? { startColumn: next } : {}),
  };
  return [...layout.slice(0, index), first, marker, second, ...layout.slice(index + 1)];
}

export function buildPattern(input: DraftInput): Pattern {
  const n = Math.max(1, input.sizes.length);
  const ids: string[] = [];
  const charts: Chart[] = input.charts.map((c) => {
    const id = uniqueId(c.name, ids, 'chart');
    ids.push(id);
    return applySymbolRows(blankChart({ id, name: c.name.slice(0, 40) || id }, 1, 1), c.rows);
  });
  const byName = new Map(charts.map((c) => [c.name, c] as const));
  const byId = new Map(charts.map((c) => [c.id, c] as const));

  let layout: Segment[] = [];
  const counter = new Map<string, number>();
  for (const item of input.sequence ?? []) {
    const chart = byName.get(item.chart);
    if (!chart) continue;
    const k = (counter.get(chart.id) ?? 0) + 1;
    counter.set(chart.id, k);
    const stitches = item.stitches && item.stitches.length === n ? [...item.stitches] : undefined;
    layout.push({
      kind: 'chart',
      placementId: `${chart.id}-${k}`,
      chartId: chart.id,
      ...(stitches
        ? { stitches: stitches.every((v) => v === stitches[0]) ? (stitches[0] ?? 0) : stitches }
        : {}),
    });
  }
  const [front, back] = input.sectionNames ?? [undefined, undefined];
  if (layout.length > 0 && input.marker && input.marker.length === n) {
    const side: Segment = back
      ? { kind: 'marker', id: 'side', sectionName: back }
      : { kind: 'marker', id: 'side' };
    layout = placeMarker(layout, byId, n, input.marker, side) ?? layout;
  }
  const hasSide = layout.some((s) => s.kind === 'marker');
  const start: Segment =
    hasSide && front
      ? { kind: 'marker', id: 'start', sectionName: front }
      : { kind: 'marker', id: 'start' };
  layout = [start, ...layout];

  const count =
    input.stitchCount && input.stitchCount.length === n ? [...input.stitchCount] : undefined;
  return {
    id: uniqueId(input.id, [], 'pattern'),
    name: input.name.slice(0, 60) || 'Wzór',
    construction: 'round',
    firstRowSide: 'RS',
    charts,
    symbols: [],
    legend: [...input.legend],
    layout,
    ...(count
      ? { expectedStitches: count.every((v) => v === count[0]) ? (count[0] ?? 0) : count }
      : {}),
  };
}

export interface ProjectDraftInput extends DraftInput {
  readonly projectId: string;
  /** Project name, e.g. the pattern's title from the description. */
  readonly title: string;
  readonly now: string;
}

/** A new project holding the imported pattern. */
export function buildProject(input: ProjectDraftInput): Project {
  const pattern = buildPattern(input);
  return {
    id: input.projectId,
    name: input.title.slice(0, 120) || 'Projekt',
    revision: 1,
    sizes: input.sizes.length ? input.sizes.map((s) => s.slice(0, 20)) : ['1'],
    sizeIndex: 0,
    patterns: [pattern],
    activePatternId: pattern.id,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
