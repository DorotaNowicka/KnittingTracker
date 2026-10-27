import { diagnostic, mod, resolveSize, type Diagnostic } from '../basics';
import { parseChart, type ChartCell, type ParsedChart } from '../chart/parse';
import { applyDesign } from '../design/compose';
import type { Chart, ChartSegment, Pattern, ProjectContent } from '../schema/pattern';
import { createRegistry, type SymbolRegistry } from '../symbols/registry';
import type { CustomSymbol } from '../schema/pattern';
import type { SymbolDef } from '../symbols/types';

export type Side = 'RS' | 'WS';

/** A chart placed in a pattern: a contiguous run of stitches in work order. */
export interface Zone {
  readonly placementId: string;
  readonly chartId: string;
  readonly label: string;
  /** Inclusive stitch range in RS work order (stitch 1 = first worked = rightmost in RS view). */
  readonly firstStitch: number;
  readonly lastStitch: number;
  /** Inclusive display-column range in RS view (column 1 = leftmost). */
  readonly firstCol: number;
  readonly lastCol: number;
  readonly chart: ParsedChart;
  /** Chart column (1-based) worked first. */
  readonly startColumn: number;
  readonly rowOffset: number;
  /**
   * Set when the vertical phase continues a placement of an earlier pattern (DR-3). `known` is
   * false while that pattern's row count is not known yet (open-ended and not finished).
   */
  readonly continued?: {
    readonly patternId: string;
    readonly placementId: string;
    readonly known: boolean;
  };
}

export interface Marker {
  readonly id: string;
  /** Number of stitches before the marker in work order (0 = start of the round/row). */
  readonly afterStitch: number;
}

export interface Section {
  readonly name: string;
  readonly firstStitch: number;
  readonly lastStitch: number;
}

/** What a grid cell shows: the chart cell plus where it sits. */
export interface GridCell extends ChartCell {
  readonly zone: Zone;
  readonly chartRow: number;
  readonly chartCol: number;
  /** Stitch number in RS work order. */
  readonly stitch: number;
  /** Display column in RS view. */
  readonly col: number;
}

export interface ResolvedPattern {
  readonly pattern: Pattern;
  readonly sizeIndex: number;
  readonly registry: SymbolRegistry;
  readonly stitchCount: number;
  /** Planned rows, or null for open-ended patterns. */
  readonly plannedRows: number | null;
  readonly zones: readonly Zone[];
  readonly markers: readonly Marker[];
  readonly sections: readonly Section[];
  readonly diagnostics: readonly Diagnostic[];
  /** Side of the work facing the knitter on row `row` (1-based). */
  side(row: number): Side;
  /** Cell at stitch number `stitch` (RS work order) of row `row`. */
  cellAtStitch(row: number, stitch: number): GridCell;
  /** Cell at display column `col` (RS view, 1 = leftmost) of row `row`. */
  cellAtCol(row: number, col: number): GridCell;
  symbol(cell: ChartCell): SymbolDef;
}

/** Convert a validated custom symbol to a SymbolDef (drops absent optional fields). */
export function customToSymbolDef(c: CustomSymbol): SymbolDef {
  const base: SymbolDef = {
    id: c.id,
    family: c.family,
    width: c.width,
    consumes: c.consumes,
    produces: c.produces,
    worked: c.worked,
    ws: c.ws,
    glyph: c.glyph,
    label: c.label,
    description: c.description,
  };
  return {
    ...base,
    ...(c.numbers ? { numbers: c.numbers } : {}),
    ...(c.flow ? { flow: c.flow } : {}),
  };
}

export function patternRegistry(pattern: Pattern): SymbolRegistry {
  return createRegistry(pattern.symbols.map(customToSymbolDef));
}

/** Chart content after the knitter's modifications (DR-1). The charts themselves stay as drawn. */
export function effectiveCharts(pattern: Pattern): Map<string, Chart> {
  const charts = new Map(pattern.charts.map((c) => [c.id, c] as const));
  for (const m of pattern.modifications ?? []) {
    if (m.kind === 'replaceChart' && charts.has(m.chartId)) {
      charts.set(m.chartId, { ...m.chart, id: m.chartId });
    }
  }
  return charts;
}

export interface ResolveOptions {
  /** Size to resolve; defaults to the project's chosen size. */
  readonly sizeIndex?: number;
  readonly registry?: SymbolRegistry;
}

type PhaseResult =
  | { readonly ok: true; readonly offset: number }
  | {
      readonly ok: false;
      readonly problem: 'missing' | 'cycle' | 'unknown';
      readonly source: string;
    };

/**
 * Rows worked in a pattern: what the knitter recorded when finishing it, else the planned count.
 * Null for an open-ended pattern that is not finished.
 */
export function patternRows(
  project: ProjectContent,
  patternId: string,
  sizeIndex: number = project.sizeIndex,
): number | null {
  const finished = project.finishedRows?.[patternId];
  if (finished !== undefined) return finished;
  const pattern = project.patterns.find((s) => s.id === patternId);
  if (!pattern || pattern.rows === undefined) return null;
  try {
    return resolveSize(pattern.rows, sizeIndex);
  } catch {
    return null;
  }
}

/**
 * Row offset after the last row worked in placement `ref` (DR-3): its own starting offset (which may
 * continue a placement further back) plus the rows of its pattern.
 */
function phaseAfter(
  project: ProjectContent,
  ref: { readonly patternId: string; readonly placementId: string },
  sizeIndex: number,
  seen: ReadonlySet<string>,
): PhaseResult {
  const key = `${ref.patternId}\u0000${ref.placementId}`;
  const source = project.patterns.find((s) => s.id === ref.patternId);
  if (seen.has(key)) return { ok: false, problem: 'cycle', source: source?.name ?? ref.patternId };
  const seg = source?.layout.find(
    (x): x is ChartSegment => x.kind === 'chart' && x.placementId === ref.placementId,
  );
  if (!source || !seg)
    return { ok: false, problem: 'missing', source: source?.name ?? ref.patternId };
  let start = seg.rowOffset ?? 0;
  if (seg.continueFrom) {
    const before = phaseAfter(project, seg.continueFrom, sizeIndex, new Set([...seen, key]));
    if (!before.ok) return before;
    start = before.offset;
  }
  const rows = patternRows(project, source.id, sizeIndex);
  if (rows === null) return { ok: false, problem: 'unknown', source: source.name };
  return { ok: true, offset: start + rows };
}

/**
 * Resolve one pattern of a project for one size into a queryable grid (ADR-2).
 *
 * Horizontal placement: a chart segment covers `stitches` stitches (default: the chart's width in
 * the chart as drawn, so a modification never changes the stitch count). Its stitches use
 * chart columns starting at `startColumn` (default: rightmost, i.e. the first worked) and moving
 * left, wrapping around: this gives partial repeats such as "over 22 sts, ending with the first
 * stitch of the chart" (DR-2).
 *
 * Vertical placement: row r uses chart row ((r - 1 + rowOffset) mod height) + 1, so each
 * chart repeats independently with its own height.
 */
export function resolvePattern(
  project: ProjectContent,
  patternId: string,
  options: ResolveOptions = {},
): ResolvedPattern {
  const stored = project.patterns.find((s) => s.id === patternId);
  if (!stored) throw new Error(`Unknown pattern: ${patternId}`);
  const sizeIndex = options.sizeIndex ?? project.sizeIndex;
  if (sizeIndex < 0 || sizeIndex >= project.sizes.length) {
    throw new RangeError(`Size index ${sizeIndex} out of range (${project.sizes.length} sizes)`);
  }
  const registry = options.registry ?? patternRegistry(stored);
  // A creator design is stored composed as drawn; another size of it is composed here.
  const sizes = stored.design?.sizes;
  const pattern =
    sizes && sizeIndex !== sizes.base ? applyDesign(stored, registry, sizeIndex) : stored;
  const original = new Map(pattern.charts.map((c) => [c.id, c] as const));
  const charts = effectiveCharts(pattern);
  const parsedCache = new Map<string, ParsedChart>();
  const parsed = (chartId: string): ParsedChart => {
    let p = parsedCache.get(chartId);
    if (!p) {
      const chart = charts.get(chartId);
      if (!chart) throw new Error(`Unknown chart: ${chartId}`);
      p = parseChart(chart, registry);
      parsedCache.set(chartId, p);
    }
    return p;
  };

  const diags: Diagnostic[] = [];
  const where = { patternId: pattern.id };
  const zones: Omit<Zone, 'firstCol' | 'lastCol'>[] = [];
  const markers: Marker[] = [];
  const sectionStarts: { name: string; afterStitch: number }[] = [];
  let count = 0;

  for (const seg of pattern.layout) {
    if (seg.kind === 'marker') {
      markers.push({ id: seg.id, afterStitch: count });
      if (seg.sectionName) sectionStarts.push({ name: seg.sectionName, afterStitch: count });
      continue;
    }
    const base = original.get(seg.chartId);
    if (!base) {
      diags.push(
        diagnostic(
          'unknown-chart',
          'error',
          `Segment ${seg.placementId} uses unknown chart ${seg.chartId}.`,
          where,
          { pattern: pattern.name, chart: seg.chartId },
        ),
      );
      continue;
    }
    const p = parsed(seg.chartId);
    const width = seg.stitches === undefined ? base.width : resolveSize(seg.stitches, sizeIndex);
    if (width === 0) continue;
    const startColumn = seg.startColumn ?? p.chart.width;
    if (startColumn > p.chart.width) {
      diags.push(
        diagnostic(
          'start-column',
          'error',
          `Segment ${seg.placementId}: start column ${startColumn} > chart width.`,
          where,
          { pattern: pattern.name, chart: p.chart.name, column: startColumn, width: p.chart.width },
        ),
      );
    }
    let rowOffset = seg.rowOffset ?? 0;
    let continued: Zone['continued'];
    if (seg.continueFrom) {
      const label = seg.label ?? p.chart.name;
      const phase = phaseAfter(
        project,
        seg.continueFrom,
        sizeIndex,
        new Set([`${pattern.id}\u0000${seg.placementId}`]),
      );
      continued = { ...seg.continueFrom, known: phase.ok };
      if (phase.ok) rowOffset = mod(phase.offset, p.chart.height);
      else if (phase.problem === 'unknown')
        diags.push(
          diagnostic(
            'continue-unknown',
            'info',
            `${label} continues the chart rows of ${phase.source}; they are fixed when ${phase.source} is finished.`,
            where,
            { pattern: pattern.name, placement: label, source: phase.source },
          ),
        );
      else
        diags.push(
          diagnostic(
            phase.problem === 'cycle' ? 'continue-cycle' : 'continue-missing',
            'error',
            phase.problem === 'cycle'
              ? `${label} in ${pattern.name} continues itself through other patterns.`
              : `${label} in ${pattern.name} continues a placement that does not exist in ${phase.source}.`,
            where,
            { pattern: pattern.name, placement: label, source: phase.source },
          ),
        );
    }
    zones.push({
      placementId: seg.placementId,
      chartId: seg.chartId,
      label: seg.label ?? p.chart.name,
      firstStitch: count + 1,
      lastStitch: count + width,
      chart: p,
      startColumn: Math.min(startColumn, p.chart.width),
      rowOffset,
      ...(continued ? { continued } : {}),
    });
    count += width;
  }

  const stitchCount = count;
  if (stitchCount === 0 && pattern.tracking !== 'rows') {
    diags.push(
      diagnostic('empty-layout', 'error', `${pattern.name} has no stitches yet.`, where, {
        pattern: pattern.name,
      }),
    );
  }
  const toCol = (stitch: number) => stitchCount - stitch + 1;
  const fullZones: Zone[] = zones.map((z) => ({
    ...z,
    firstCol: toCol(z.lastStitch),
    lastCol: toCol(z.firstStitch),
  }));

  if (pattern.expectedStitches !== undefined) {
    const expected = resolveSize(pattern.expectedStitches, sizeIndex);
    if (expected !== stitchCount) {
      diags.push(
        diagnostic(
          'stitch-count',
          'error',
          `Layout of ${pattern.name} has ${stitchCount} stitches; the pattern says ${expected}.`,
          where,
          { pattern: pattern.name, actual: stitchCount, expected },
        ),
      );
    }
  }

  const sections: Section[] = sectionStarts.map((s, i) => {
    const next = sectionStarts[i + 1];
    const end = next ? next.afterStitch : (sectionStarts[0]?.afterStitch ?? 0) + stitchCount;
    return { name: s.name, firstStitch: s.afterStitch + 1, lastStitch: Math.min(end, stitchCount) };
  });

  // Zone lookup by stitch: zones are contiguous and sorted.
  const zoneAt = (stitch: number): Zone => {
    let lo = 0;
    let hi = fullZones.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const z = fullZones[mid];
      if (!z) break;
      if (stitch < z.firstStitch) hi = mid - 1;
      else if (stitch > z.lastStitch) lo = mid + 1;
      else return z;
    }
    throw new RangeError(`Stitch ${stitch} is outside pattern ${pattern.name} (1…${stitchCount})`);
  };

  const cellAtStitch = (row: number, stitch: number): GridCell => {
    if (!Number.isInteger(row) || row < 1) throw new RangeError(`Invalid row ${row}`);
    const z = zoneAt(stitch);
    const w = z.chart.chart.width;
    const h = z.chart.chart.height;
    const k = stitch - z.firstStitch;
    const chartCol = mod(z.startColumn - 1 - k, w) + 1;
    const chartRow = mod(row - 1 + z.rowOffset, h) + 1;
    const cell = z.chart.cells[chartRow - 1]?.[chartCol - 1];
    if (!cell) throw new RangeError(`Chart ${z.chartId} has no cell (${chartRow}, ${chartCol})`);
    return { ...cell, zone: z, chartRow, chartCol, stitch, col: toCol(stitch) };
  };

  const side = (row: number): Side => {
    if (pattern.construction === 'round') return 'RS';
    const first = pattern.firstRowSide;
    return row % 2 === 1 ? first : first === 'RS' ? 'WS' : 'RS';
  };

  const plannedRows = pattern.rows === undefined ? null : resolveSize(pattern.rows, sizeIndex);

  return {
    pattern,
    sizeIndex,
    registry,
    stitchCount,
    plannedRows,
    zones: fullZones,
    markers,
    sections,
    diagnostics: [...[...parsedCache.values()].flatMap((p) => p.diagnostics), ...diags],
    side,
    cellAtStitch,
    cellAtCol: (row, col) => cellAtStitch(row, stitchCount - col + 1),
    symbol: (cell) => registry.require(cell.symbolId),
  };
}

/** Convenience: a pattern of a project by id. */
export function findPattern(
  project: Pick<ProjectContent, 'patterns'>,
  patternId: string,
): Pattern | undefined {
  return project.patterns.find((s) => s.id === patternId);
}
