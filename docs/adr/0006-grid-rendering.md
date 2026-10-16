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

## Implementation notes (M2, 2026-10-16)

- **Two layers, as decided**: the static layer (paper, done cells with hatch, symbols, rules, zone
  borders) is rendered into **256-px tiles** kept in an LRU cache (about twice the visible tiles).
  Each frame blits the visible tiles and draws the overlay: veil above the current row, row keeper,
  stitch marker, keyboard cursor, frozen header (sections, zones, stitch numbers) and row-number
  gutters. Tiles overlap by 2 px, so rounding to device pixels never opens a seam. The hatch is
  anchored to chart coordinates.
- A tap changes `done`, which invalidates all tiles (one full repaint per tap). Zooming re-renders the
  visible tiles at the new cell size. **Not done yet**: scaling cached tiles during a pinch and
  re-rendering only when it ends (planned for M6 if pinch feels heavy on real devices).
- **Level of detail**: glyphs and rules from 4.5 px cells. The renderer clamps cells to 4–64 px.
- **Hairlines**: whole device pixels (≈ 0.75 CSS px), snapped to the pixel grid.
- **Measured** (Playwright, Chromium software rendering, CPU throttled 4×, 500 × 300 synthetic grid,
  60 wheel-pan frames): desktop 1440×900 average ≈ 2.5–3 ms per frame, p95 ≈ 6–7 ms; tablet 820×1180
  @2× average ≈ 3 ms, p95 ≈ 8–9 ms. Budget 16 ms. Before the tile cache, p95 was 16–37 ms.
  This is the e2e test `e2e/perf.spec.ts`. Real-device GPU canvases should be faster.
- **Test hook**: outside production builds `window.__ktGrid` exposes the renderer and a
  `pointOf(row, col)` helper for e2e tests. It is not present when `VITE_APP_ENV=prod`.
