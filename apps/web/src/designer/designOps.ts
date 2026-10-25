import {
  mirrorAreas,
  placementArea,
  type Chart,
  type Design,
  type Placement,
  type SymbolRegistry,
} from '@kt/core';

/**
 * Changes to a creator design, pure. Columns on the canvas are display columns (1 = leftmost, as
 * drawn); the design stores knitter's positions (stitch from the right edge, row from the bottom).
 */

/** Stitch from the right edge for a display column, and back. */
export const fromRight = (design: Pick<Design, 'width'>, col: number) => design.width - col + 1;

/** Where a placement would land, as a canvas rectangle; null when it starts off the grid. */
export function areaRect(
  design: Pick<Design, 'width' | 'height'>,
  placement: Placement,
  motif: Pick<Chart, 'width' | 'height'>,
) {
  const area = placementArea(design, placement, motif);
  return area ? { row1: area.bottom, row2: area.top, col1: area.left, col2: area.right } : null;
}

const nextId = (design: Design) => {
  let n = design.placements.length + 1;
  while (design.placements.some((p) => p.id === `p${n}`)) n += 1;
  return `p${n}`;
};

/** The design with this piece copied in (a piece with the same id is replaced). */
const withMotif = (design: Design, motif: Chart): Design => ({
  ...design,
  motifs: [...design.motifs.filter((m) => m.id !== motif.id), motif],
});

/** Drop copies of pieces nothing is placed with any more. */
const tidy = (design: Design): Design => ({
  ...design,
  motifs: design.motifs.filter((m) => design.placements.some((p) => p.motifId === m.id)),
});

export type PlaceInput = Omit<Placement, 'id' | 'motifId'>;

/** Place a piece as a new tile (callers check {@link conflictOf} first). */
export function placeMotif(
  design: Design,
  motif: Chart,
  input: PlaceInput,
): { design: Design; id: string } {
  const id = nextId(design);
  return {
    design: {
      ...withMotif(design, motif),
      placements: [...design.placements, { ...input, id, motifId: motif.id }],
    },
    id,
  };
}

export function updatePlacement(design: Design, id: string, input: PlaceInput): Design {
  return {
    ...design,
    placements: design.placements.map((p) => (p.id === id ? { ...p, ...input } : p)),
  };
}

export function removePlacement(design: Design, id: string): Design {
  return tidy({ ...design, placements: design.placements.filter((p) => p.id !== id) });
}

type Rect = NonNullable<ReturnType<typeof areaRect>>;

const meets = (a: Rect, b: Rect) =>
  a.col1 <= b.col2 && b.col1 <= a.col2 && a.row1 <= b.row2 && b.row1 <= a.row2;

/** The piece copy a placement uses. */
const motifOf = (design: Design, placement: Placement) =>
  design.motifs.find((m) => m.id === placement.motifId);

/** The tile covering a cell of the canvas (display column, row from the bottom). */
export function tileAt(design: Design, row: number, col: number): Placement | undefined {
  return design.placements.find((p) => {
    const motif = motifOf(design, p);
    const r = motif ? areaRect(design, p, motif) : null;
    return r !== null && row >= r.row1 && row <= r.row2 && col >= r.col1 && col <= r.col2;
  });
}

/**
 * Why a tile can't lie there: it starts off the grid, it would cover another tile, or it would lie
 * where a mirror shows the other side.
 */
export type Conflict =
  | { readonly kind: 'off' }
  | { readonly kind: 'overlap'; readonly with: Placement }
  | { readonly kind: 'mirror' };

/** Whether display columns `col1`…`col2` reach into a mirror image. */
export const inMirror = (design: Design, col1: number, col2: number) =>
  mirrorAreas(design).some((m) => col1 <= m.lastCol && col2 >= m.firstCol);

/**
 * Whether `motif` placed at `input` fits: on the grid and over no other tile (tiles never
 * overlap; `ignore` is the tile being moved or changed). Null when it fits.
 */
export function conflictOf(
  design: Design,
  motif: Pick<Chart, 'width' | 'height'>,
  input: PlaceInput,
  ignore: string | null = null,
): Conflict | null {
  return conflictAmong(design, motif, input, ignore === null ? [] : [ignore]);
}

/** {@link conflictOf} ignoring several tiles (those moving together). */
function conflictAmong(
  design: Design,
  motif: Pick<Chart, 'width' | 'height'>,
  input: PlaceInput,
  ignore: readonly string[],
): Conflict | null {
  const rect = areaRect(design, { ...input, id: '', motifId: '' }, motif);
  // A tile starts at stitch 1 or further left: never past the right edge.
  if (!rect || input.col < 1) return { kind: 'off' };
  if (inMirror(design, rect.col1, rect.col2)) return { kind: 'mirror' };
  for (const other of design.placements) {
    if (ignore.includes(other.id)) continue;
    const m = motifOf(design, other);
    const r = m ? areaRect(design, other, m) : null;
    if (r && meets(rect, r)) return { kind: 'overlap', with: other };
  }
  return null;
}

/**
 * Tiles stand on the grid's bottom row and repeat upwards by their own height to the top: the
 * knitter designs the lowest rows of a part. Only the start column and the width are theirs.
 */
export const onBottom = (col: number, repeatX: number | 'fill'): PlaceInput => ({
  col,
  row: 1,
  repeatX,
  repeatY: 'fill',
});

/** Stitches (from the right edge) each tile other than `ignore` and each mirror image covers. */
function spans(design: Design, ignore: string | null) {
  const tiles = design.placements.flatMap((p) => {
    if (p.id === ignore) return [];
    const m = motifOf(design, p);
    const r = m ? areaRect(design, p, m) : null;
    return r ? [{ from: fromRight(design, r.col2), to: fromRight(design, r.col1) }] : [];
  });
  const mirrors = mirrorAreas(design).map((m) => ({
    from: fromRight(design, m.lastCol),
    to: fromRight(design, m.firstCol),
  }));
  return [...tiles, ...mirrors];
}

/**
 * Most whole repeats of a piece that fit from stitch `col` (from the right) to the left, before
 * the next tile or the grid's edge; 0 when not even one fits.
 */
export function maxRepeats(
  design: Design,
  motif: Pick<Chart, 'width'>,
  col: number,
  ignore: string | null = null,
): number {
  let end = design.width;
  for (const s of spans(design, ignore)) {
    if (s.to < col) continue;
    if (s.from <= col) return 0;
    end = Math.min(end, s.from - 1);
  }
  return Math.max(0, Math.floor((end - col + 1) / motif.width));
}

/** Columns (display) a brush cell covers. */
const span = (design: Design, cell: Design['cells'][number], registry: SymbolRegistry) => {
  const left = fromRight(design, cell.col);
  return { left, right: left + (registry.get(cell.symbolId)?.width ?? 1) - 1 };
};

/** Remove brush cells that cover (row, col). */
export function eraseCell(
  design: Design,
  registry: SymbolRegistry,
  row: number,
  col: number,
): Design {
  const cells = design.cells.filter((c) => {
    if (c.row !== row) return true;
    const s = span(design, c, registry);
    return col < s.left || col > s.right;
  });
  return cells.length === design.cells.length ? design : { ...design, cells };
}

/**
 * Paint a symbol with its leftmost cell at (row, col), on top of the pieces. Brush cells it
 * overlaps are replaced; a wide symbol is moved left to fit the grid.
 */
export function brushCell(
  design: Design,
  registry: SymbolRegistry,
  row: number,
  col: number,
  symbolId: string,
): Design {
  const width = registry.get(symbolId)?.width ?? 1;
  const left = Math.max(1, Math.min(col, design.width - width + 1));
  const right = left + width - 1;
  const same = design.cells.find(
    (c) => c.row === row && fromRight(design, c.col) === left && c.symbolId === symbolId,
  );
  if (same) return design;
  const cells = design.cells.filter((c) => {
    if (c.row !== row) return true;
    const s = span(design, c, registry);
    return s.right < left || s.left > right;
  });
  return { ...design, cells: [...cells, { row, col: fromRight(design, left), symbolId }] };
}

/**
 * Change the grid's size. Pieces keep their positions counted from the right edge and the bottom;
 * brush cells that no longer fit are dropped.
 */
export function resizeDesign(design: Design, width: number, height: number): Design {
  return {
    ...design,
    width,
    height,
    cells: design.cells.filter((c) => c.col <= width && c.row <= height),
  };
}

/**
 * Move tiles together sideways by `shift` display columns (positive = to the right). Returns the
 * changed design, or why one of them can't go there.
 */
export function moveTiles(
  design: Design,
  ids: readonly string[],
  shift: number,
): { design: Design; conflict: null } | { design: null; conflict: Conflict } {
  const moving = design.placements.filter((p) => ids.includes(p.id));
  const moved = new Map(moving.map((p) => [p.id, { ...p, col: p.col - shift }] as const));
  for (const p of moved.values()) {
    const motif = motifOf(design, p);
    if (!motif) continue;
    const conflict = conflictAmong(design, motif, p, ids);
    if (conflict) return { design: null, conflict };
  }
  return {
    design: { ...design, placements: design.placements.map((p) => moved.get(p.id) ?? p) },
    conflict: null,
  };
}

/** Tiles copied together: each piece, its width in repeats and its offset from the rightmost. */
export interface Clip {
  readonly items: readonly {
    readonly motif: Chart;
    readonly repeatX: Placement['repeatX'];
    /** Stitches from the group's right edge to this tile's right edge. */
    readonly offset: number;
  }[];
}

/** The selected tiles as a clip, in their order on the grid; null when none is selected. */
export function copyTiles(design: Design, ids: readonly string[]): Clip | null {
  const picked = design.placements.filter((p) => ids.includes(p.id));
  const first = Math.min(...picked.map((p) => p.col));
  const items = picked.flatMap((p) => {
    const motif = motifOf(design, p);
    return motif ? [{ motif, repeatX: p.repeatX, offset: p.col - first }] : [];
  });
  return items.length > 0 ? { items } : null;
}

/** Where a clip's tiles land with the group's right edge at stitch `col` (from the right). */
const clipInputs = (clip: Clip, col: number) =>
  clip.items.map((it) => ({ motif: it.motif, input: onBottom(col + it.offset, it.repeatX) }));

/** Why a clip can't be laid there, or null when it fits. */
export function clipConflict(design: Design, clip: Clip, col: number): Conflict | null {
  for (const { motif, input } of clipInputs(clip, col)) {
    const conflict = conflictOf(design, motif, input);
    if (conflict) return conflict;
  }
  return null;
}

/** Lay a clip's tiles (callers check {@link clipConflict} first); returns the new tiles' ids. */
export function placeClip(
  design: Design,
  clip: Clip,
  col: number,
): { design: Design; ids: string[] } {
  let next = design;
  const ids: string[] = [];
  for (const { motif, input } of clipInputs(clip, col)) {
    const placed = placeMotif(next, motif, input);
    next = placed.design;
    ids.push(placed.id);
  }
  return { design: next, ids };
}

/** Display rectangles of tiles a clip would cover with its right edge at stitch `col`. */
export function clipRects(design: Design, clip: Clip, col: number) {
  return clipInputs(clip, col).flatMap(({ motif, input }) => {
    const r = areaRect(design, { ...input, id: '', motifId: '' }, motif);
    return r ? [r] : [];
  });
}

/** Remove several tiles. */
export function removeTiles(design: Design, ids: readonly string[]): Design {
  return ids.reduce((d, id) => removePlacement(d, id), design);
}

/** Turn the mirror at a quarter of the width on or off. */
export function toggleMirror(design: Design, quarter: 1 | 2 | 3): Design {
  const on = design.mirrors ?? [];
  const mirrors = on.includes(quarter) ? on.filter((q) => q !== quarter) : [...on, quarter];
  const { mirrors: _old, ...rest } = design;
  return mirrors.length > 0 ? { ...rest, mirrors } : rest;
}
