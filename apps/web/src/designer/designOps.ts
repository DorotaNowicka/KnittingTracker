import {
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

/** Why a tile can't lie there: it starts off the grid, or it would cover another tile. */
export type Conflict =
  { readonly kind: 'off' } | { readonly kind: 'overlap'; readonly with: Placement };

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
  const rect = areaRect(design, { ...input, id: '', motifId: '' }, motif);
  if (!rect) return { kind: 'off' };
  for (const other of design.placements) {
    if (other.id === ignore) continue;
    const m = motifOf(design, other);
    const r = m ? areaRect(design, other, m) : null;
    if (r && meets(rect, r)) return { kind: 'overlap', with: other };
  }
  return null;
}

/** Whole repeats that fit from a tile's start to the grid's edge (at least 1). */
export function roomFor(
  design: Pick<Design, 'width' | 'height'>,
  motif: Pick<Chart, 'width' | 'height'>,
  input: Pick<PlaceInput, 'col' | 'row'>,
): { readonly across: number; readonly up: number } {
  const right = design.width - input.col + 1;
  const above = design.height - input.row + 1;
  return {
    across: Math.max(1, Math.floor(right / motif.width)),
    up: Math.max(1, Math.floor(above / motif.height)),
  };
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
