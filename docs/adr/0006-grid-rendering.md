# ADR-0006: Grid rendering

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Decision: Canvas 2D, viewport-virtualized, with a tile cache and separate layers.**
- `grid-renderer` = **camera** (pan/zoom math, hit-testing, pure) + **scene builder** (given a resolved
  stage and a viewport, it emits draw commands; pure and snapshot-testable in Node) + **Canvas2D backend**.
- Layers: (1) **static tiles** (zones, grid lines, symbols, labels), rasterized per zoom bucket into
  offscreen 512×512 device-pixel tiles with an LRU cache; (2) **dynamic overlay** (done cells, current
  row band, last-stitch ring, keyboard cursor, hover), redrawn each frame and cheap (one rect per
  visible row span).
- HiDPI: backing store × `devicePixelRatio`, grid lines snapped to device pixels, and stroke width as a
  function of cell size (thin lines stay ≥1 device px, symbol strokes ≈ 9–11% of the cell).
- Gestures: Pointer Events (two-pointer pinch with the focal point preserved), `wheel` (with
  ctrl+wheel/trackpad pinch = zoom), keyboard (arrows move the cursor, `+`/`-` zoom, `Space` = mark,
  `Enter` = complete row, `Ctrl/Cmd+Z` / `Shift+Ctrl/Cmd+Z`). During a pinch the existing tiles are
  scaled, and they are re-rasterized when the gesture ends, which keeps 60 fps.
- **LOD**: below ~6 px/cell, symbols are drawn as density blocks and labels thinned. Below ~3 px, zone
  colours only (overview).
- **Never truncate silently**: visible rows default to `stageEnd`. For open-ended stages, the default is
  the current row plus the largest chart height in the layout, and a dashed "continues" edge shows
  above it. Every chart zone shows complete repeats or a "cut here" mark.
- **Not colour alone**: done cells = tint + diagonal hatch. Current row = thick frame + side arrow
  showing the work direction (← or →, with RS/WS label). Last done stitch = heavy ring + notch.
- **Accessibility surround**: a focusable canvas with `role="application"` and a full keyboard model,
  an `aria-live` status, and the DR-12 "current row as text" panel, which is also the screen-reader view.
- Optional optimization (M6): rasterize tiles in a worker via `OffscreenCanvas`.

**Alternatives.** One SVG (prototype; rejected by the spec and too slow at 150k cells). SVG with DOM
virtualization (still heavy re-layout on zoom, no tile reuse). WebGL (fastest, but text and glyph
quality and complexity are not worth it for ≤150k cells, and the Canvas2D tile cache meets the budget).

**Verification.** A perf page in e2e (500×300 synthetic grid, scripted pan/zoom, rAF frame timing,
4× CPU throttle) asserts NFR-3 budgets. Visual regression covers synthetic patterns at 3 zoom
levels × 2 themes.
