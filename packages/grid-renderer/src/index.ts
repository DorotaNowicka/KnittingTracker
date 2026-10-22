/**
 * @kt/grid-renderer — renders a chart grid into a canvas (ADR-6).
 *
 * - `geometry` and `camera`: pure layout, pan/zoom and hit-test math.
 * - `scene`: pure draw-command builder for the visible part of the grid.
 * - `canvas2d` + `renderer`: the browser backend.
 */
export {
  CELL_PX_MAX,
  CELL_PX_MIN,
  clampCellPx,
  GridGeometry,
  metricsFor,
  type Band,
  type GridCell,
  type GridSource,
  type Metrics,
} from './geometry';
export { clampCamera, hitTest, panBy, revealCell, zoomAt, type CameraState } from './camera';
export {
  buildScene,
  LOD,
  type ColorRole,
  type DrawCommand,
  type Overlay,
  type SceneLayers,
} from './scene';
export { paint, PALETTE_VARS, readPalette, type Palette } from './canvas2d';
export { alignmentStep, GridRenderer, type RendererStats } from './renderer';
export {
  chartSource,
  editorOverlay,
  patternSource,
  progressOverlay,
  visibleRowCount,
  type OverlayOptions,
} from './fromPattern';
