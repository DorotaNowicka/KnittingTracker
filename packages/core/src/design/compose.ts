import {
  applySymbolRows,
  blankChart,
  chartToSymbolRows,
  paintCell,
  repairRows,
} from '../chart/edit';
import { STD } from '../symbols/library';
import type { SymbolRegistry } from '../symbols/registry';
import type { Chart, Design, Pattern, Placement } from '../schema/pattern';

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
  return out;
}

/** Id of the chart a design is composed into. */
export const DESIGN_CHART_ID = 'design';

/**
 * The pattern with its chart composed from its design: one chart as wide and tall as the grid,
 * placed once, and the planned rows set to the grid's height. Patterns without a design are
 * returned unchanged.
 */
export function applyDesign(pattern: Pattern, registry: SymbolRegistry): Pattern {
  const design = pattern.design;
  if (!design) return pattern;
  const chart = applySymbolRows(
    blankChart({ id: DESIGN_CHART_ID, name: pattern.name.slice(0, 40) || 'Wzór' }, 1, 1),
    composeDesign(design, registry),
  );
  return {
    ...pattern,
    charts: [chart],
    layout: [
      { kind: 'marker', id: 'start' },
      { kind: 'chart', placementId: `${DESIGN_CHART_ID}-1`, chartId: DESIGN_CHART_ID },
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
