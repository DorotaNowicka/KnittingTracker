/**
 * @kt/grid-renderer — renders a resolved stage into a canvas (ADR-6).
 *
 * Planned structure (M2): `camera` (pan/zoom/hit-test math, pure), `scene` (draw-command builder,
 * pure), `canvas2d` (backend). M0 ships the camera clamp helper that every zoom path will use.
 */

/** Allowed on-screen cell size in CSS pixels. Cells are always square. */
export const CELL_PX_MIN = 4;
export const CELL_PX_MAX = 64;

/** Clamp a requested cell size to the supported range; non-finite input falls back to the minimum. */
export function clampCellPx(value: number): number {
  if (!Number.isFinite(value)) return CELL_PX_MIN;
  return Math.min(CELL_PX_MAX, Math.max(CELL_PX_MIN, value));
}
