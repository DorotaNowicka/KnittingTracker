import { clampCellPx, GridGeometry, type GridSource } from './geometry';

/**
 * Viewport over the grid world (ADR-6). Pure state + math, no DOM: pan, zoom around a focal
 * point, clamping and hit-testing are unit-tested in Node.
 */
export interface CameraState {
  /** Cell size in CSS px. */
  readonly cell: number;
  /** World coordinate shown at the viewport's top-left corner. */
  readonly scrollX: number;
  readonly scrollY: number;
  /** Viewport size in CSS px. */
  readonly width: number;
  readonly height: number;
}

type Src = Pick<GridSource, 'cols' | 'rows' | 'sections'>;

/**
 * Keep the content on screen: it may not be scrolled past its edges. Content narrower than the
 * viewport is centered; shorter content sits at the top, right under the frozen header.
 */
export function clampCamera(state: CameraState, geo: GridGeometry): CameraState {
  const clampAxis = (scroll: number, content: number, view: number, small: 'center' | 'start') =>
    content <= view
      ? small === 'center'
        ? -(view - content) / 2
        : 0
      : Math.min(Math.max(0, scroll), content - view);
  return {
    ...state,
    scrollX: clampAxis(state.scrollX, geo.width, state.width, 'center'),
    scrollY: clampAxis(state.scrollY, geo.height, state.height, 'start'),
  };
}

/** Fractional grid position (col, rowFromTop) under a screen point; used to keep it fixed on zoom. */
function gridPoint(geo: GridGeometry, state: CameraState, sx: number, sy: number) {
  const wx = state.scrollX + sx;
  const wy = state.scrollY + sy;
  // Fractional column within the nearest run.
  const run =
    geo.runs.find((r) => wx < r.x + (r.lastCol - r.firstCol + 1) * geo.m.cell) ?? geo.runs.at(-1);
  const col = run ? run.firstCol - 1 + (wx - run.x) / geo.m.cell : 0;
  const rowFromTop = (wy - geo.m.header) / geo.m.cell;
  return { col, rowFromTop };
}

export function panBy(state: CameraState, geo: GridGeometry, dx: number, dy: number): CameraState {
  return clampCamera({ ...state, scrollX: state.scrollX - dx, scrollY: state.scrollY - dy }, geo);
}

/**
 * Zoom to `cell` keeping the grid point under (sx, sy) in place. Returns the new state and the
 * geometry for the new cell size.
 */
export function zoomAt(
  state: CameraState,
  source: Src,
  cell: number,
  sx: number,
  sy: number,
): { state: CameraState; geo: GridGeometry } {
  const before = new GridGeometry(source, state.cell);
  const p = gridPoint(before, state, sx, sy);
  const nextCell = clampCellPx(cell);
  const geo = new GridGeometry(source, nextCell);
  const col = Math.min(Math.max(p.col, 0), source.cols);
  const whole = Math.min(Math.max(1, Math.floor(col) + 1), source.cols);
  const x = geo.colX(whole) + (col - (whole - 1)) * geo.m.cell;
  const y = geo.m.header + p.rowFromTop * geo.m.cell;
  return {
    state: clampCamera({ ...state, cell: nextCell, scrollX: x - sx, scrollY: y - sy }, geo),
    geo,
  };
}

/** Scroll so that a cell is visible; `center` puts it in the middle of the viewport. */
export function revealCell(
  state: CameraState,
  geo: GridGeometry,
  row: number,
  col: number,
  mode: 'center' | 'nearest' = 'nearest',
  margin = 2,
): CameraState {
  const x = geo.colX(col);
  const y = geo.rowY(row);
  const c = geo.m.cell;
  if (mode === 'center') {
    return clampCamera(
      { ...state, scrollX: x + c / 2 - state.width / 2, scrollY: y + c / 2 - state.height / 2 },
      geo,
    );
  }
  const pad = margin * c;
  let { scrollX, scrollY } = state;
  if (x - pad < scrollX) scrollX = x - pad;
  else if (x + c + pad > scrollX + state.width) scrollX = x + c + pad - state.width;
  if (y - pad - geo.m.header < scrollY) scrollY = y - pad - geo.m.header;
  else if (y + c + pad > scrollY + state.height) scrollY = y + c + pad - state.height;
  return clampCamera({ ...state, scrollX, scrollY }, geo);
}

/** Cell under a screen point (CSS px relative to the canvas), or null. */
export function hitTest(state: CameraState, geo: GridGeometry, sx: number, sy: number) {
  return geo.cellAt(state.scrollX + sx, state.scrollY + sy);
}
