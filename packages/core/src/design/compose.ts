import {
  applySymbolRows,
  blankChart,
  chartToSymbolRows,
  mirrorSymbolId,
  paintCell,
  repairRows,
} from '../chart/edit';
import { chartColorRows, withColorRows } from '../chart/colors';
import { STD } from '../symbols/library';
import { boundOffAbove, shapeRows } from './shaping';
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

/**
 * The design's colours (colourwork), row 1 first, RS view left → right; null where a cell has no
 * colour of its own. Pieces bring their own colours (a piece without colours clears what is under
 * it), the colour brush paints on top, and mirrors copy colours like they copy stitches.
 */
export function composeColors(design: Design): (string | null)[][] {
  const rows: (string | null)[][] = Array.from({ length: design.height }, () =>
    Array<string | null>(design.width).fill(null),
  );
  const motifs = new Map(design.motifs.map((m) => [m.id, m] as const));
  for (const placement of design.placements) {
    const motif = motifs.get(placement.motifId);
    if (!motif) continue;
    const area = placementArea(design, placement, motif);
    if (!area) continue;
    const colors = chartColorRows(motif);
    for (let y = area.bottom; y <= area.top; y++) {
      const source = colors[(y - area.bottom) % motif.height];
      const row = rows[y - 1];
      if (!row || !source) continue;
      for (let x = area.left; x <= area.right; x++) {
        row[x - 1] = source[motif.width - 1 - ((area.right - x) % motif.width)] ?? null;
      }
    }
  }
  for (const cell of design.colorCells ?? []) {
    const x = design.width - cell.col + 1;
    const row = rows[cell.row - 1];
    if (row && x >= 1) row[x - 1] = cell.yarn;
  }
  for (const area of mirrorAreas(design)) {
    const width = area.lastCol - area.firstCol + 1;
    for (const row of rows) {
      const source = [...row];
      // Each cell lands as far left of the axis as it was right of it.
      for (let k = 0; k < width; k++)
        row[area.lastCol - 1 - k] = source[area.axisCol - 1 + k] ?? null;
    }
  }
  return rows;
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
  const rows = shapedRows(design, registry);
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

/**
 * The design's grid composed, with its shaping ("no stitch" and the shaping symbols) and with
 * bound-off stitches gone above the "bind off".
 */
export const shapedRows = (design: Design, registry: SymbolRegistry): string[][] =>
  repairRows(boundOffAbove(shapeRows(composeDesign(design, registry), design, registry)), registry);

/** Rows (from 1) where splitting in halves cuts a symbol in two; empty when not split. */
export function halfCuts(design: Design, registry: SymbolRegistry): number[] {
  if (!design.halves || design.width < 2) return [];
  const whole = shapedRows(design, registry);
  const knitted = knittedRows(design, registry);
  return whole.flatMap((row, i) => (row.some((id, c) => knitted[i]?.[c] !== id) ? [i + 1] : []));
}

/** The whole design as one chart, as it is knitted (the creator shows it like this). */
export function designChart(design: Design, registry: SymbolRegistry, name: string): Chart {
  return withColorRows(
    applySymbolRows(
      blankChart({ id: DESIGN_CHART_ID, name: name.slice(0, 40) || 'Wzór' }, 1, 1),
      knittedRows(design, registry),
    ),
    composeColors(design),
  );
}

/**
 * The pattern with its chart composed from its design: one chart as wide and tall as the grid,
 * placed once, and the planned rows set to the grid's height. A design split in halves becomes two
 * charts with a marker between them, so the grid shows them as sections (front | back). The grid
 * sets the stitch count, so a stated per-size count (from an imported file) is dropped. Patterns
 * without a design are returned unchanged.
 */
export function applyDesign(
  pattern: Pattern,
  registry: SymbolRegistry,
  /** Size to compose (the project's other sizes, {@link designAtSize}); default: as drawn. */
  sizeIndex?: number,
): Pattern {
  if (!pattern.design) return pattern;
  const drawn = pattern.design;
  const design = sizeIndex === undefined ? drawn : designAtSize(drawn, sizeIndex);
  const { expectedStitches: _stated, rows: _planned, ...rest } = pattern;
  const name = pattern.name.slice(0, 40) || 'Wzór';
  // Knitted "until N cm": no planned rows, the chart repeats upwards. It is composed as tall as
  // it takes every piece to come round again, so each keeps its own rhythm across repeats.
  const open = pattern.targetCm !== undefined;
  // Pieces whose rhythms come round together only after too many rows: each stretch of columns
  // becomes a chart of its own, repeating upwards by its own pieces (as charts side by side do).
  if (open && repeatingDesign(design) === null) {
    const strips = stripsOf(design, registry, name);
    if (strips) return { ...rest, ...strips };
  }
  const composed = open ? (repeatingDesign(design) ?? design) : design;
  const rows = knittedRows(composed, registry);
  const colors = composeColors(composed);
  // Planned rows: the grid's height, per size when the sizes have their own heights.
  const heights = drawn.sizes?.height;
  const planned = open
    ? {}
    : { rows: heights ? heights.map((h) => h ?? drawn.height) : drawn.height };
  const halves = design.halves && design.width >= 2 ? design.halves : null;
  if (!halves) {
    return {
      ...rest,
      charts: [
        withColorRows(
          applySymbolRows(blankChart({ id: DESIGN_CHART_ID, name }, 1, 1), rows),
          colors,
        ),
      ],
      layout: [
        { kind: 'marker', id: 'start' },
        { kind: 'chart', placementId: `${DESIGN_CHART_ID}-1`, chartId: DESIGN_CHART_ID },
      ],
      ...planned,
    };
  }
  // RS view: the first half is on the right.
  const cut = cutOf(design);
  const half = (id: string, from: number, to: number) =>
    withColorRows(
      applySymbolRows(
        blankChart({ id, name }, 1, 1),
        rows.map((r) => r.slice(from, to)),
      ),
      colors.map((r) => r.slice(from, to)),
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
    ...planned,
  };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Rows a composed chart may have when it repeats upwards. */
const TALLEST = 1000;

/**
 * A design made tall enough to repeat seamlessly: the grid's height and every piece's height come
 * round together, brush stitches repeating with the grid. Null when that takes more than 1000 rows.
 */
function repeatingDesign(withShape: Design): Design | null {
  const heights = withShape.placements.flatMap((p) => {
    const m = withShape.motifs.find((x) => x.id === p.motifId);
    return m ? [m.height] : [];
  });
  const height = heights.reduce(lcm, withShape.height);
  return height > TALLEST ? null : repeatedTo(withShape, height);
}

/** The design composed `height` rows tall (a multiple of its own height, or a stretch of pieces). */
function repeatedTo(withShape: Design, height: number): Design {
  // Knitted until N cm, the grid repeats upwards: a shape does not repeat with it.
  const { shaping: _none, ...design } = withShape;
  if (height === design.height) return design;
  if (height < design.height || height % design.height !== 0) return { ...design, height };
  const copies = height / design.height;
  return {
    ...design,
    height,
    cells: Array.from({ length: copies }, (_, k) =>
      design.cells.map((c) => ({ ...c, row: c.row + k * design.height })),
    ).flat(),
    ...(design.colorCells
      ? {
          colorCells: Array.from({ length: copies }, (_, k) =>
            (design.colorCells ?? []).map((c) => ({ ...c, row: c.row + k * design.height })),
          ).flat(),
        }
      : {}),
  };
}

/**
 * Per display column (1 = leftmost, index 0), the rows after which it repeats: the heights of the
 * pieces on it that run all the way up from row 1; the grid's own height where something else
 * lies on it (a piece starting higher or repeated a number of times, the brush, colours); 1 for
 * plain background. Mirrored columns repeat like the columns they copy.
 */
function columnPeriods(design: Design): number[] {
  const period = Array<number>(design.width).fill(1);
  const motifs = new Map(design.motifs.map((m) => [m.id, m] as const));
  for (const placement of design.placements) {
    const motif = motifs.get(placement.motifId);
    if (!motif) continue;
    const area = placementArea(design, placement, motif);
    if (!area) continue;
    const own = placement.row === 1 && placement.repeatY === 'fill' ? motif.height : design.height;
    for (let x = area.left; x <= area.right; x++) period[x - 1] = lcm(period[x - 1] ?? 1, own);
  }
  for (const cell of [...design.cells, ...(design.colorCells ?? [])]) {
    const x = design.width - cell.col + 1;
    if (x >= 1 && x <= design.width) period[x - 1] = lcm(period[x - 1] ?? 1, design.height);
  }
  for (const area of mirrorAreas(design)) {
    const width = area.lastCol - area.firstCol + 1;
    const source = [...period];
    for (let k = 0; k < width; k++)
      period[area.firstCol - 1 + k] = source[area.axisCol + width - 2 - k] ?? 1;
  }
  return period;
}

/**
 * An open design as charts side by side, each a stretch of columns that repeats by its own rows
 * (see `columnPeriods`), cut where the grid is split in halves. A symbol over several columns
 * stays in one stretch. Null when the whole grid would be one stretch anyway.
 */
function stripsOf(
  withShape: Design,
  registry: SymbolRegistry,
  name: string,
): Pick<Pattern, 'charts' | 'layout'> | null {
  const { shaping: _none, ...design } = withShape;
  const period = columnPeriods(design).map((p) => (p > TALLEST ? design.height : p));
  const flat = knittedRows(design, registry);
  const halves = design.halves && design.width >= 2 ? design.halves : null;
  const cut = halves ? cutOf(design) : -1;
  // Stretches of display columns [from, to] (1-based) with one period.
  const strips: { from: number; to: number; period: number }[] = [];
  for (let x = 1; x <= design.width; x++) {
    const last = strips[strips.length - 1];
    const joined = flat.some((row) => row[x - 1] === CONTINUATION);
    const p = period[x - 1] ?? 1;
    if (last && x - 1 !== cut && (joined || last.period === p)) {
      last.to = x;
      last.period = lcm(last.period, p);
    } else strips.push({ from: x, to: x, period: p });
  }
  for (const s of strips) if (s.period > TALLEST) s.period = design.height;
  if (strips.length < 2) return null;
  const composed = new Map<number, { rows: string[][]; colors: (string | null)[][] }>();
  const at = (height: number) => {
    let c = composed.get(height);
    if (!c) {
      const d = repeatedTo(design, height);
      c = { rows: knittedRows(d, registry), colors: composeColors(d) };
      composed.set(height, c);
    }
    return c;
  };
  // The piece on top of a stretch names its chart.
  const motifs = new Map(design.motifs.map((m) => [m.id, m] as const));
  const nameOf = (from: number, to: number) => {
    let found = name;
    for (const placement of design.placements) {
      const motif = motifs.get(placement.motifId);
      const area = motif ? placementArea(design, placement, motif) : null;
      if (motif && area && area.left <= from && area.right >= to) found = motif.name || name;
    }
    return found.slice(0, 40);
  };
  // Work order: stitch 1 is the rightmost column.
  const ordered = [...strips].reverse();
  const charts: Chart[] = ordered.map((s, i) => {
    const { rows, colors } = at(s.period);
    const id = i === 0 ? DESIGN_CHART_ID : `${DESIGN_CHART_ID}-${i + 1}`;
    return withColorRows(
      applySymbolRows(
        blankChart({ id, name: nameOf(s.from, s.to) }, 1, 1),
        repairRows(
          rows.map((r) => r.slice(s.from - 1, s.to)),
          registry,
        ),
      ),
      colors.map((r) => r.slice(s.from - 1, s.to)),
    );
  });
  const layout: Pattern['layout'] = [
    halves
      ? { kind: 'marker', id: 'start', sectionName: halves[0] }
      : { kind: 'marker', id: 'start' },
  ];
  ordered.forEach((s, i) => {
    const chart = charts[i];
    if (!chart) return;
    // The back half begins left of the cut.
    if (halves && s.to === cut) layout.push({ kind: 'marker', id: 'side', sectionName: halves[1] });
    layout.push({ kind: 'chart', placementId: `${chart.id}-1`, chartId: chart.id });
  });
  return { charts, layout };
}

// ── Sizes ─────────────────────────────────────────────────────────────────────────────────

/** Stitches (from the right edge) of the part of a grid a stitch belongs to: a half, or all. */
function regionsOf(design: Pick<Design, 'width' | 'halves'>) {
  const w = design.width;
  if (!design.halves || w < 2) return [{ start: 1, end: w }];
  const fh = firstHalf(w);
  return [
    { start: 1, end: fh },
    { start: fh + 1, end: w },
  ];
}

const middle = (r: { start: number; end: number }) => (r.start + r.end) / 2;

/** Index of the region holding stitch `at` (counted from the right edge). */
const regionAt = (regions: readonly { start: number; end: number }[], at: number) =>
  Math.max(
    0,
    regions.findIndex((r) => at <= r.end),
  );

/**
 * The design in one of the project's sizes: its width, height and pieces' repeats for that size
 * ({@link Design.sizes}), each piece kept where it was relative to the middle of its half (or of
 * the grid) — a cable in the middle of the front stays in the middle of the front. A piece that
 * runs to the edge (`fill`) keeps its distance from the start of its half. The size it was drawn
 * in (and a design without sizes) is returned as is.
 */
export function designAtSize(design: Design, sizeIndex: number): Design {
  const sizes = design.sizes;
  if (!sizes || sizeIndex === sizes.base) return design;
  const width = sizes.width?.[sizeIndex] ?? design.width;
  const height = sizes.height?.[sizeIndex] ?? design.height;
  const repeats = new Map(
    (sizes.repeats ?? []).map((r) => [r.placementId, r.values[sizeIndex] ?? null] as const),
  );
  const before = regionsOf(design);
  const after = regionsOf({ width, halves: design.halves });
  const placements = design.placements.map((p): Placement => {
    const motif = design.motifs.find((m) => m.id === p.motifId);
    if (!motif) return p;
    if (p.repeatX === 'fill') {
      const i = regionAt(before, p.col);
      const shift = (after[i]?.start ?? 1) - (before[i]?.start ?? 1);
      return { ...p, col: Math.max(1, p.col + shift) };
    }
    const repeatX = repeats.get(p.id) ?? p.repeatX;
    const wide = Math.min(p.repeatX * motif.width, design.width - p.col + 1);
    const centre = p.col + (wide - 1) / 2;
    const i = regionAt(before, centre);
    const from = before[i];
    const to = after[i];
    const moved = from && to ? middle(to) + (centre - middle(from)) : centre;
    const col = Math.round(moved - (repeatX * motif.width - 1) / 2);
    return { ...p, repeatX, col: Math.max(1, col) };
  });
  const moveCol = <T extends { col: number }>(c: T): T => {
    const i = regionAt(before, c.col);
    const from = before[i];
    const to = after[i];
    const col = from && to ? Math.round(c.col + middle(to) - middle(from)) : c.col;
    return { ...c, col: Math.max(1, col) };
  };
  const cells = design.cells.map(moveCol);
  return {
    ...design,
    width,
    height,
    placements,
    cells,
    ...(design.colorCells ? { colorCells: design.colorCells.map(moveCol) } : {}),
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
