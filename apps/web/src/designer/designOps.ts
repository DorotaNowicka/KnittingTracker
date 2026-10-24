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

/** Place a piece on top of everything placed so far. */
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

/** Move a placement one layer up (towards the top, later) or down. */
export function movePlacement(design: Design, id: string, by: 1 | -1): Design {
  const i = design.placements.findIndex((p) => p.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= design.placements.length) return design;
  const placements = [...design.placements];
  const [moved] = placements.splice(i, 1);
  if (moved) placements.splice(j, 0, moved);
  return { ...design, placements };
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
