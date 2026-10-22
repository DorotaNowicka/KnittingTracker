import {
  createRegistry,
  createRowModel,
  parseChart,
  resolvePattern,
  type Chart,
  type Project,
} from '@kt/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampCamera, hitTest, panBy, revealCell, zoomAt, type CameraState } from './camera';
import {
  chartSource,
  editorOverlay,
  progressOverlay,
  patternSource,
  visibleRowCount,
} from './fromPattern';
import { CELL_PX_MAX, CELL_PX_MIN, clampCellPx, GridGeometry, type GridSource } from './geometry';
import { alignmentStep } from './renderer';
import { buildScene, LOD, type DrawCommand } from './scene';

/** Synthetic charts: a 2-cell cable in A, a "no stitch" cell in B. */
const charts: Chart[] = [
  {
    id: 'a',
    name: 'A',
    width: 6,
    height: 2,
    palette: { k: 'std:k', p: 'std:p', X: 'cable:1-1-rc' },
    rows: ['pX.kkp', 'pkkkkp'],
  },
  {
    id: 'b',
    name: 'B',
    width: 4,
    height: 3,
    palette: { k: 'std:k', p: 'std:p', x: 'std:none' },
    rows: ['kpkp', 'pkpk', 'kxkp'],
  },
];
const own = { charts, symbols: [], legend: [] };

/** Synthetic project: 2 sections of 6 + 4 stitches, and a flat pattern. */
const pattern: Project = {
  id: 'p',
  name: 'T',
  revision: 1,
  sizes: ['one'],
  sizeIndex: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  patterns: [
    {
      ...own,
      id: 's',
      name: 'S',
      construction: 'round',
      firstRowSide: 'RS',
      rows: 6,
      layout: [
        { kind: 'marker', id: 'm1', sectionName: 'Front' },
        { kind: 'chart', placementId: 'a', chartId: 'a' },
        { kind: 'marker', id: 'm2', sectionName: 'Back' },
        { kind: 'chart', placementId: 'b', chartId: 'b' },
      ],
    },
    {
      ...own,
      id: 'flat',
      name: 'F',
      construction: 'flat',
      firstRowSide: 'RS',
      layout: [{ kind: 'chart', placementId: 'a', chartId: 'a' }],
    },
  ],
};
const stage = resolvePattern(pattern, 's');
const source: GridSource = patternSource(stage, 6);
const cam = (over: Partial<CameraState> = {}): CameraState => ({
  cell: 20,
  scrollX: 0,
  scrollY: 0,
  width: 400,
  height: 300,
  ...over,
});

describe('geometry', () => {
  it('clamps cell sizes', () => {
    expect(clampCellPx(2)).toBe(CELL_PX_MIN);
    expect(clampCellPx(500)).toBe(CELL_PX_MAX);
    expect(clampCellPx(Number.NaN)).toBe(CELL_PX_MIN);
  });

  it('adapts the pattern: Back on the left, Front on the right, stitch 1 at the right edge', () => {
    expect(source.cols).toBe(10);
    expect(source.sections).toEqual([
      { label: 'Back', firstCol: 1, lastCol: 4 },
      { label: 'Front', firstCol: 5, lastCol: 10 },
    ]);
    expect(source.stitchNumber(10)).toBe(1);
    expect(source.stitchNumber(1)).toBe(10);
    expect(source.cell(3, 2)).toMatchObject({ noStitch: true });
    expect(source.cell(1, 6)).toMatchObject({ width: 2, part: 0 });
    expect(source.cell(1, 7)).toMatchObject({ width: 2, part: 1 });
    expect(source.continuesAbove).toBe(false);
  });

  it('separates sections with a gap and maps cells both ways', () => {
    const geo = new GridGeometry(source, 20);
    expect(geo.runs.map((r) => [r.firstCol, r.lastCol])).toEqual([
      [1, 4],
      [5, 10],
    ]);
    expect(geo.colX(5) - geo.colX(4)).toBe(20 + geo.m.gap);
    expect(geo.cellAt(geo.colX(4) + 20 + 2, geo.rowY(1) + 1)).toBeNull(); // inside the gap
    for (let row = 1; row <= 6; row++) {
      for (let col = 1; col <= 10; col++) {
        expect(geo.cellAt(geo.colX(col) + 10, geo.rowY(row) + 10)).toEqual({ row, col });
      }
    }
    expect(geo.cellAt(0, geo.rowY(1))).toBeNull();
    expect(geo.cellAt(geo.colX(1), 0)).toBeNull();
    expect(geo.rowsIn(geo.rowY(4), geo.rowY(2) + 20)).toEqual({ first: 2, last: 4 });
    expect(geo.colsIn(geo.colX(3), geo.colX(6) + 1)).toEqual({ first: 3, last: 6 });
    expect(geo.colsIn(-100, -50)).toBeNull();
    expect(geo.rowsIn(-100, 0)).toBeNull();
  });
});

describe('camera', () => {
  const geo = new GridGeometry(source, 20);

  it('centers content smaller than the viewport and clamps larger content', () => {
    const small = clampCamera(cam({ width: 2000, height: 2000 }), geo);
    expect(small.scrollX).toBeLessThan(0);
    const big = new GridGeometry({ ...source, cols: 10, rows: 300 }, 20);
    expect(clampCamera(cam({ scrollY: -50 }), big).scrollY).toBe(0);
    expect(clampCamera(cam({ scrollY: 1e9 }), big).scrollY).toBe(big.height - 300);
  });

  it('pans and hit-tests', () => {
    const big = new GridGeometry({ ...source, rows: 300 }, 20);
    const moved = panBy(cam(), big, 0, -100);
    expect(moved.scrollY).toBe(100);
    const hit = hitTest(
      moved,
      big,
      big.colX(3) - moved.scrollX + 5,
      big.rowY(290) - moved.scrollY + 5,
    );
    expect(hit).toEqual({ row: 290, col: 3 });
  });

  it('property: zooming keeps the cell under the focal point', () => {
    // Wide and tall content: small content is centered, where no focal point can stay fixed.
    const tall = { ...source, cols: 200, rows: 400, sections: [] };
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 60, max: 380 }),
        fc.integer({ min: 80, max: 280 }),
        (from, to, fx, fy) => {
          const g0 = new GridGeometry(tall, from);
          const start = clampCamera(
            cam({ cell: from, scrollX: g0.colX(100) - 200, scrollY: g0.rowY(200) - 150 }),
            g0,
          );
          const before = hitTest(start, g0, fx, fy);
          if (!before) return true;
          const { state, geo: g1 } = zoomAt(start, tall, to, fx, fy);
          const after = hitTest(state, g1, fx, fy);
          // The same cell (or a direct neighbour when clamping at the edges) stays under the finger.
          return (
            !!after &&
            Math.abs(after.row - before.row) <= 1 &&
            Math.abs(after.col - before.col) <= 1
          );
        },
      ),
    );
  });

  it('reveals a cell (nearest or centered)', () => {
    const big = new GridGeometry({ ...source, rows: 300 }, 20);
    const near = revealCell(cam(), big, 5, 3);
    const y = big.rowY(5) - near.scrollY;
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y + 20).toBeLessThanOrEqual(300);
    const centered = revealCell(cam(), big, 150, 3, 'center');
    expect(big.rowY(150) - centered.scrollY + 10).toBeCloseTo(150, 0);
  });
});

const kinds = (cmds: DrawCommand[]) => cmds.map((c) => c.t);

describe('scene', () => {
  const model = createRowModel(stage);

  it('draws glyphs, rules, keeper and marker at normal zoom', () => {
    const geo = new GridGeometry(source, 20);
    const overlay = progressOverlay(model, 13); // row 2, 3 stitches done
    const cmds = buildScene(
      source,
      geo,
      clampCamera(cam({ width: 800, height: 400 }), geo),
      overlay,
    );
    const k = kinds(cmds);
    expect(k).toContain('glyphs');
    expect(k).toContain('marker');
    expect(k).toContain('hatch');
    expect(cmds.filter((c) => c.t === 'text' && c.text === 'Front')).toHaveLength(1);
    expect(cmds.filter((c) => c.t === 'text' && (c.text === 'A' || c.text === 'B'))).toHaveLength(
      2,
    );
    // Keeper strip on the current row in both sections.
    expect(cmds.filter((c) => c.t === 'rect' && c.fill === 'indigo')).toHaveLength(2);
    expect(overlay.currentRow).toBe(2);
    expect(overlay.done(1)).toBe('all');
    expect(overlay.done(2)).toEqual({ fromCol: 8, toCol: 10 });
    expect(overlay.done(3)).toBeNull();
    expect(overlay.marker).toEqual({ row: 2, col: 8 });
  });

  it('drops glyphs and rules when zoomed far out (level of detail)', () => {
    const geo = new GridGeometry(source, LOD.rules - 1);
    const k = kinds(buildScene(source, geo, clampCamera(cam(), geo), progressOverlay(model, 0)));
    expect(k).not.toContain('glyphs');
    expect(k).not.toContain('hatch');
  });

  it('shows WS rows working left to right and finishes with no keeper', () => {
    const flat = createRowModel(resolvePattern(pattern, 'flat'));
    expect(progressOverlay(flat, 6).direction).toBe('left-to-right');
    expect(progressOverlay(flat, 7).done(2)).toEqual({ fromCol: 1, toCol: 1 });
    const end = progressOverlay(model, model.total() ?? 0);
    expect(end.currentRow).toBeNull();
    expect(end.done(6)).toBe('all');
    expect(progressOverlay(model, 0).done(1)).toBeNull();
  });

  it('marks the edge when more rows follow', () => {
    const open = resolvePattern(pattern, 'flat');
    expect(visibleRowCount(open, 1, 'end')).toBe(4); // current row + one repeat, whole repeats
    expect(visibleRowCount(open, 2, 'end')).toBe(4);
    expect(visibleRowCount(stage, 1, 'end')).toBe(6);
    expect(visibleRowCount(stage, 1, 3)).toBe(3);
    const src = patternSource(open, 4);
    expect(src.continuesAbove).toBe(true);
    const geo = new GridGeometry(src, 20);
    const cmds = buildScene(
      src,
      geo,
      clampCamera(cam(), geo),
      progressOverlay(createRowModel(open), 0),
    );
    expect(
      cmds.some((c) => c.t === 'lines' && c.dash !== undefined && c.stroke === 'ruleStrong'),
    ).toBe(true);
  });

  it('builds a 500 × 300 viewport scene within budget', () => {
    const wide: Project = {
      ...pattern,
      patterns: [
        {
          ...own,
          id: 'w',
          name: 'W',
          construction: 'round',
          firstRowSide: 'RS',
          rows: 300,
          layout: [
            { kind: 'chart', placementId: 'a', chartId: 'a', stitches: 500, startColumn: 1 },
          ],
        },
      ],
    };
    const st = resolvePattern(wide, 'w');
    const src = patternSource(st, 300);
    const m = createRowModel(st);
    const geo = new GridGeometry(src, 16);
    const view = clampCamera(
      { cell: 16, scrollX: 2000, scrollY: 1500, width: 1280, height: 800 },
      geo,
    );
    const overlay = progressOverlay(m, 40_000);
    buildScene(src, geo, view, overlay); // warm caches
    const t0 = performance.now();
    for (let i = 0; i < 20; i++)
      buildScene(src, geo, { ...view, scrollX: view.scrollX + i * 7 }, overlay);
    const perFrame = (performance.now() - t0) / 20;
    expect(perFrame).toBeLessThan(16);
  });
});

describe('static layer cache helpers', () => {
  it('finds a step that is a whole number of device pixels', () => {
    expect(alignmentStep(1)).toBe(1);
    expect(alignmentStep(2)).toBe(1);
    expect(alignmentStep(1.5)).toBe(2);
    expect(alignmentStep(2.625)).toBe(8);
    expect(alignmentStep(3)).toBe(1);
  });

  it('builds only the cells inside a limit rectangle', () => {
    const geo = new GridGeometry(source, 20);
    const regionCam = { cell: 20, scrollX: 0, scrollY: 0, width: geo.width, height: geo.height };
    const model = createRowModel(stage);
    const full = buildScene(source, geo, regionCam, progressOverlay(model, 0), 'static');
    const strip = buildScene(source, geo, regionCam, progressOverlay(model, 0), 'static', {
      x: geo.colX(1),
      y: geo.rowY(6),
      w: 40,
      h: 20,
    });
    const glyphCount = (cmds: DrawCommand[]) =>
      cmds.reduce((n, c) => n + (c.t === 'glyphs' ? c.items.length : 0), 0);
    expect(glyphCount(strip)).toBeLessThan(glyphCount(full));
    expect(strip.some((c) => c.t === 'text')).toBe(false);
  });
});

describe('editor', () => {
  const registry = createRegistry();
  const chart = charts[0];
  if (!chart) throw new Error('fixture');
  const src = chartSource(parseChart(chart, registry), registry);

  it('adapts one chart with columns numbered from the right', () => {
    expect(src.cols).toBe(6);
    expect(src.rows).toBe(2);
    expect(src.zones).toEqual([{ label: 'A', firstCol: 1, lastCol: 6 }]);
    expect(src.stitchNumber(1)).toBe(6);
    expect(src.cell(1, 2)).toMatchObject({ width: 2, part: 0, noStitch: false });
    expect(src.cell(9, 9)).toMatchObject({ width: 1, part: 0 });
  });

  it('draws the selection and flagged cells only in the overlay layer', () => {
    const geo = new GridGeometry(src, 20);
    const overlay = editorOverlay({
      selection: { row1: 1, col1: 2, row2: 2, col2: 3 },
      highlights: [{ row: 1, col: 1 }],
      cursor: { row: 2, col: 2 },
    });
    const all = buildScene(src, geo, cam(), overlay, 'overlay');
    expect(all.some((d) => d.t === 'rect' && d.fill === 'indigo' && d.alpha === 0.12)).toBe(true);
    expect(all.some((d) => d.t === 'lines' && d.stroke === 'danger')).toBe(true);
    const sel = all.find((d) => d.t === 'rect' && d.fill === 'indigo' && d.alpha === 0.12);
    expect(sel).toMatchObject({ w: 40, h: 40 });
    const stat = buildScene(src, geo, cam(), overlay, 'static');
    expect(stat.some((d) => d.t === 'lines' && d.stroke === 'danger')).toBe(false);
    expect(editorOverlay({}).done(1)).toBeNull();
  });
});
