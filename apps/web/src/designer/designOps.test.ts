import { blankDesign, composeDesign, createRegistry, MOTIF_LIBRARY } from '@kt/core';
import { describe, expect, it } from 'vitest';
import {
  areaRect,
  brushCell,
  eraseCell,
  conflictOf,
  firstFree,
  maxRepeats,
  onBottom,
  tileAt,
  placeMotif,
  removePlacement,
  resizeDesign,
  updatePlacement,
} from './designOps';

const registry = createRegistry();
const lib = (id: string) => {
  const m = MOTIF_LIBRARY.find((x) => x.chart.id === `lib:${id}`);
  if (!m) throw new Error(id);
  return m.chart;
};

describe('changing a design', () => {
  it('places, edits, reorders and removes pieces, keeping only the pieces in use', () => {
    let d = blankDesign(10, 6);
    const a = placeMotif(d, lib('rib-1-1'), { col: 1, row: 1, repeatX: 'fill', repeatY: 2 });
    const b = placeMotif(a.design, lib('moss'), { col: 3, row: 3, repeatX: 2, repeatY: 'fill' });
    d = b.design;
    expect(d.placements.map((p) => [p.id, p.motifId])).toEqual([
      ['p1', 'lib:rib-1-1'],
      ['p2', 'lib:moss'],
    ]);
    expect(
      areaRect(
        d,
        d.placements[1] ?? { id: '', motifId: '', col: 1, row: 1, repeatX: 1, repeatY: 1 },
        lib('moss'),
      ),
    ).toEqual({
      row1: 3,
      row2: 6,
      col1: 5,
      col2: 8,
    });
    d = updatePlacement(d, 'p2', { col: 1, row: 3, repeatX: 'fill', repeatY: 'fill' });
    expect(d.placements[1]).toMatchObject({ col: 1, repeatX: 'fill' });
    d = removePlacement(d, 'p2');
    expect(d.motifs.map((m) => m.id)).toEqual(['lib:rib-1-1']);
    expect(placeMotif(d, lib('moss'), { col: 1, row: 1, repeatX: 1, repeatY: 1 }).id).toBe('p2');
  });

  it('paints with the brush on top, replaces overlapped cells and erases them', () => {
    let d = blankDesign(6, 2);
    d = brushCell(d, registry, 1, 6, 'std:p');
    d = brushCell(d, registry, 1, 2, 'cable:2-2-lc');
    expect(d.cells).toEqual([
      { row: 1, col: 1, symbolId: 'std:p' },
      { row: 1, col: 5, symbolId: 'cable:2-2-lc' },
    ]);
    d = brushCell(d, registry, 1, 3, 'std:yo');
    expect(d.cells).toEqual([
      { row: 1, col: 1, symbolId: 'std:p' },
      { row: 1, col: 4, symbolId: 'std:yo' },
    ]);
    expect(composeDesign(d, registry)[0]).toEqual([
      'std:k',
      'std:k',
      'std:yo',
      'std:k',
      'std:k',
      'std:p',
    ]);
    expect(resizeDesign(d, 3, 2).cells).toEqual([{ row: 1, col: 1, symbolId: 'std:p' }]);
    // A wide symbol at the right edge moves left to fit, replacing what it covers.
    d = brushCell(d, registry, 1, 5, 'cable:2-2-lc');
    expect(d.cells).toEqual([{ row: 1, col: 4, symbolId: 'cable:2-2-lc' }]);
    d = eraseCell(d, registry, 1, 6);
    expect(d.cells).toEqual([]);
  });

  it('keeps tiles apart: finds the tile under a cell and what a tile would cover', () => {
    let d = blankDesign(20, 10);
    d = placeMotif(d, lib('rib-1-1'), { col: 1, row: 1, repeatX: 'fill', repeatY: 2 }).design;
    d = placeMotif(d, lib('moss'), { col: 1, row: 3, repeatX: 3, repeatY: 'fill' }).design;
    expect(tileAt(d, 1, 1)?.id).toBe('p1');
    expect(tileAt(d, 5, 20)?.id).toBe('p2');
    expect(tileAt(d, 5, 1)).toBeUndefined();
    const cable = lib('cable-2-2-left');
    expect(conflictOf(d, cable, { col: 7, row: 3, repeatX: 1, repeatY: 1 })).toBeNull();
    expect(conflictOf(d, cable, { col: 5, row: 3, repeatX: 1, repeatY: 1 })).toMatchObject({
      kind: 'overlap',
      with: { id: 'p2' },
    });
    expect(conflictOf(d, cable, { col: 21, row: 3, repeatX: 1, repeatY: 1 })).toEqual({
      kind: 'off',
    });
    // Moving a tile ignores the tile itself.
    expect(conflictOf(d, lib('moss'), { col: 2, row: 3, repeatX: 3, repeatY: 1 }, 'p2')).toBeNull();
  });

  it('stands tiles on the bottom row and finds room for them side by side', () => {
    let d = blankDesign(20, 8);
    const rib = lib('rib-2-2');
    const cable = lib('cable-2-2-left');
    expect(onBottom(5, 2)).toEqual({ col: 5, row: 1, repeatX: 2, repeatY: 'fill' });
    expect(firstFree(d, cable)).toBe(1);
    d = placeMotif(d, rib, onBottom(1, 1)).design; // stitches 1–4
    d = placeMotif(d, rib, onBottom(11, 1)).design; // stitches 11–14
    expect(firstFree(d, cable)).toBe(5); // stitches 5–10, just between
    expect(firstFree(placeMotif(d, cable, onBottom(5, 1)).design, cable)).toBe(15);
    expect(firstFree(d, rib)).toBe(5);
    expect(maxRepeats(d, rib, 5)).toBe(1);
    expect(maxRepeats(d, rib, 3)).toBe(0);
    expect(maxRepeats(d, rib, 15)).toBe(1);
    // A tile may grow over the place it already takes.
    expect(maxRepeats(d, rib, 1, 'p1')).toBe(2);
    expect(firstFree(placeMotif(d, cable, onBottom(15, 1)).design, rib)).toBe(5);
    // A 6-row cable and a 2-row piece side by side each repeat by their own height.
    const rows = composeDesign(
      placeMotif(
        placeMotif(blankDesign(8, 8), cable, onBottom(1, 1)).design,
        lib('moss'),
        onBottom(7, 1),
      ).design,
      registry,
    );
    expect(rows.map((r) => r.filter((x) => x === 'cable:2-2-lc').length)).toEqual([
      0, 0, 1, 0, 0, 0, 1, 0,
    ]);
  });
});
