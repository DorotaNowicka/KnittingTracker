import {
  applySymbolRows,
  blankChart,
  chartToSymbolRows,
  mirrorSymbolId,
  paintCell,
  repairRows,
} from '../chart/edit';
import { STD } from '../symbols/library';
import type { SymbolRegistry } from '../symbols/registry';
import {
  CONTINUATION,
  type Chart,
  type Design,
  type Pattern,
  type Placement,
} from '../schema/pattern';

/** Columns and rows a placement covers on a grid, 1-based display columns (1 = leftmost). */
export interface PlacementArea {
  /** Leftmost and rightmost display columns covered. */
  readonly left: number;
  readonly right: number;
  /** Bottom and top rows covered. */
  readonly bottom: number;
  readonly top: number;
  /** Repeats that fit, possibly the last one partial (e.g. 4.5). */
  readonly timesX: number;
  readonly timesY: number;
}

/**
 * Where a placed piece lands. Repeats run to the left from its start column and upwards from its
 * start row; a count that doesn't fit is cut at the grid's edge, `fill` runs to the edge.
 */
export function placementArea(
  design: Pick<Design, 'width' | 'height'>,
  placement: Placement,
  motif: Pick<Chart, 'width' | 'height'>,
): PlacementArea | null {
  const right = design.width - placement.col + 1;
  const bottom = placement.row;
  if (right < 1 || bottom > design.height) return null;
  const wanted = (repeat: Placement['repeatX'], size: number, room: number) =>
    repeat === 'fill' ? room : Math.min(room, repeat * size);
  const wide = wanted(placement.repeatX, motif.width, right);
  const tall = wanted(placement.repeatY, motif.height, design.height - bottom + 1);
  return {
    left: right - wide + 1,
    right,
    bottom,
    top: bottom + tall - 1,
    timesX: wide / motif.width,
    timesY: tall / motif.height,
  };
}

/**
 * The design's grid as symbol rows (row 1 first, RS view left → right): knit everywhere, then each
 * placement in order, then the brush cells. Each piece repeats by its own width and height, so a
 * 6-row piece next to a 20-row one keeps its own rhythm. Symbols cut at an edge or by a piece on
 * top become knit.
 */
export function composeDesign(design: Design, registry: SymbolRegistry): string[][] {
  const rows: string[][] = Array.from({ length: design.height }, () =>
    Array<string>(design.width).fill(STD.knit),
  );
  const motifs = new Map(design.motifs.map((m) => [m.id, m] as const));
  for (const placement of design.placements) {
    const motif = motifs.get(placement.motifId);
    if (!motif) continue;
    const area = placementArea(design, placement, motif);
    if (!area) continue;
    const cells = chartToSymbolRows(motif);
    for (let y = area.bottom; y <= area.top; y++) {
      const my = (y - area.bottom) % motif.height;
      const row = rows[y - 1];
      const source = cells[my];
      if (!row || !source) continue;
      for (let x = area.left; x <= area.right; x++) {
        // The piece's right edge sits on the start column; repeats continue to the left.
        const mx = motif.width - 1 - ((area.right - x) % motif.width);
        row[x - 1] = source[mx] ?? STD.knit;
      }
    }
  }
  let out = repairRows(rows, registry);
  for (const cell of design.cells) {
    const x = design.width - cell.col + 1;
    if (x < 1 || cell.row > design.height) continue;
    out = paintCell(out, registry, cell.row, x, cell.symbolId).map((r) => [...r]);
  }
  for (const area of mirrorAreas(design)) out = mirrorInto(out, registry, area);
  return out;
}

/** Stitches right of a mirror axis at `quarter` quarters of the width. */
export const mirrorAxis = (width: number, quarter: 1 | 2 | 3) => Math.round((width * quarter) / 4);

/** Where a mirror copies to, in display columns: `from`…`to` mirror the columns right of `to`. */
export interface MirrorArea {
  readonly quarter: 1 | 2 | 3;
  /** Display column just right of the axis (the axis is its left edge). */
  readonly axisCol: number;
  /** Columns that show the mirror image (left of the axis). */
  readonly firstCol: number;
  readonly lastCol: number;
}

/**
 * The design's mirrors, from the right edge leftwards (so a quarter mirrored and then the half
 * gives four-way symmetry). Each copies as many stitches as fit on both sides of its axis.
 */
export function mirrorAreas(design: Pick<Design, 'width' | 'mirrors'>): MirrorArea[] {
  const n = design.width;
  return [...new Set(design.mirrors ?? [])]
    .sort((a, b) => a - b)
    .flatMap((quarter) => {
      const k = mirrorAxis(n, quarter);
      const m = Math.min(k, n - k);
      if (m < 1) return [];
      const axisCol = n - k + 1;
      return [{ quarter, axisCol, firstCol: axisCol - m, lastCol: axisCol - 1 }];
    });
}

/**
 * Rows with the columns right of the axis mirrored onto its left: each symbol reversed in place
 * and swapped for its mirror image (a cable crossing left crosses right). A symbol cut by the
 * axis or by the copied band's far edge becomes knit.
 */
function mirrorInto(rows: string[][], registry: SymbolRegistry, area: MirrorArea): string[][] {
  const width = area.lastCol - area.firstCol + 1;
  const s1 = area.axisCol;
  const s2 = area.axisCol + width - 1;
  const out = rows.map((r) => [...r]);
  for (let i = 0; i < rows.length; i++) {
    const src = rows[i];
    const target = out[i];
    if (!src || !target) continue;
    // Walk the source right to left (away from the axis, back towards it) and write the target
    // left to right, so each stitch lands as far left of the axis as it was right of it.
    let write = area.firstCol;
    let c = s2;
    while (c >= s1) {
      let a = c;
      while (a > 1 && src[a - 1] === CONTINUATION) a -= 1;
      if (a < s1) {
        for (; c >= s1; c--) target[write++ - 1] = STD.knit;
        break;
      }
      const w = c - a + 1;
      target[write - 1] = mirrorSymbolId(src[a - 1] ?? STD.knit);
      for (let k = 1; k < w; k++) target[write - 1 + k] = CONTINUATION;
      write += w;
      c = a - 1;
    }
  }
  return repairRows(out, registry);
}

/** Id of the chart a design is composed into (its first half, when split in halves). */
export const DESIGN_CHART_ID = 'design';
/** Id of the chart of a split design's second half. */
export const DESIGN_BACK_CHART_ID = 'design-back';

/** Stitches in the first half of a split design (the right one, from stitch 1). */
export const firstHalf = (width: number) => Math.ceil(width / 2);

/** Columns (RS view) where a split design is cut: left of it the second half. */
const cutOf = (design: Design) => design.width - firstHalf(design.width);

/**
 * The design's grid as it is knitted: composed, and for a design split in halves each half made
 * well formed on its own, so a symbol crossing the middle (a cable) becomes knit there.
 */
function knittedRows(design: Design, registry: SymbolRegistry): string[][] {
  const rows = composeDesign(design, registry);
  if (!design.halves || design.width < 2) return rows;
  const cut = cutOf(design);
  const left = repairRows(
    rows.map((r) => r.slice(0, cut)),
    registry,
  );
  const right = repairRows(
    rows.map((r) => r.slice(cut)),
    registry,
  );
  return rows.map((_, i) => [...(left[i] ?? []), ...(right[i] ?? [])]);
}

/** Rows (from 1) where splitting in halves cuts a symbol in two; empty when not split. */
export function halfCuts(design: Design, registry: SymbolRegistry): number[] {
  if (!design.halves || design.width < 2) return [];
  const whole = composeDesign(design, registry);
  const knitted = knittedRows(design, registry);
  return whole.flatMap((row, i) => (row.some((id, c) => knitted[i]?.[c] !== id) ? [i + 1] : []));
}

/** The whole design as one chart, as it is knitted (the creator shows it like this). */
export function designChart(design: Design, registry: SymbolRegistry, name: string): Chart {
  return applySymbolRows(
    blankChart({ id: DESIGN_CHART_ID, name: name.slice(0, 40) || 'Wzór' }, 1, 1),
    knittedRows(design, registry),
  );
}

/**
 * The pattern with its chart composed from its design: one chart as wide and tall as the grid,
 * placed once, and the planned rows set to the grid's height. A design split in halves becomes two
 * charts with a marker between them, so the grid shows them as sections (front | back). The grid
 * sets the stitch count, so a stated per-size count (from an imported file) is dropped. Patterns
 * without a design are returned unchanged.
 */
export function applyDesign(pattern: Pattern, registry: SymbolRegistry): Pattern {
  const design = pattern.design;
  if (!design) return pattern;
  const { expectedStitches: _stated, ...rest } = pattern;
  const name = pattern.name.slice(0, 40) || 'Wzór';
  const rows = knittedRows(design, registry);
  const halves = design.halves && design.width >= 2 ? design.halves : null;
  if (!halves) {
    return {
      ...rest,
      charts: [applySymbolRows(blankChart({ id: DESIGN_CHART_ID, name }, 1, 1), rows)],
      layout: [
        { kind: 'marker', id: 'start' },
        { kind: 'chart', placementId: `${DESIGN_CHART_ID}-1`, chartId: DESIGN_CHART_ID },
      ],
      rows: design.height,
    };
  }
  // RS view: the first half is on the right.
  const cut = cutOf(design);
  const half = (id: string, from: number, to: number) =>
    applySymbolRows(
      blankChart({ id, name }, 1, 1),
      rows.map((r) => r.slice(from, to)),
    );
  return {
    ...rest,
    charts: [half(DESIGN_CHART_ID, cut, design.width), half(DESIGN_BACK_CHART_ID, 0, cut)],
    layout: [
      { kind: 'marker', id: 'start', sectionName: halves[0] },
      { kind: 'chart', placementId: `${DESIGN_CHART_ID}-1`, chartId: DESIGN_CHART_ID },
      { kind: 'marker', id: 'side', sectionName: halves[1] },
      { kind: 'chart', placementId: `${DESIGN_BACK_CHART_ID}-1`, chartId: DESIGN_BACK_CHART_ID },
    ],
    rows: design.height,
  };
}

/** A new, empty design (all knit). */
export const blankDesign = (width: number, height: number): Design => ({
  width,
  height,
  motifs: [],
  placements: [],
  cells: [],
});
