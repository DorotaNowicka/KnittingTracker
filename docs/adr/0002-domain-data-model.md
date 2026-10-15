# ADR-0002: Domain data model

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Context.** We need charts with independent vertical repeats, horizontal repeats with partial
widths, stages that inherit chart phases, round and flat knitting, shaping, per-project
modifications, and a progress model of a single position.

**Decision — entities (`packages/core`).**

```ts
type SymbolId = string;                    // 'std:k', 'std:p', 'drops:201', 'user:3f9…'

interface SymbolDef {
  id: SymbolId;
  number?: string;                          // e.g. DROPS '201'; optional (DR-10)
  width: number;                            // cells
  consumes: number; produces: number;       // stitch counts (cable 2→2, k2tog 2→1, yo 0→1, bind-off 1→0)
  flow?: { in: StitchKind[]; out: StitchKind[] };   // knit/purl permutation for the flow lint
  ws: { mode: 'invert'; symbol: SymbolId } | { mode: 'explicit'; text: I18nText } | { mode: 'unsupported' };
  glyph: Glyph;                             // vector primitives in normalized cell units (no raw SVG)
  label: I18nText;                          // short built-in name
}

interface Chart {                           // RS view, rows bottom→top, columns left→right as drawn
  id: string; name: string;                 // 'A.4'
  width: number; height: number;
  rows: ChartRow[];                         // rows[0] = row 1; compact string encoding per row
  palette: Record<string, SymbolId | 'cont' | 'none'>;   // 'cont' = continuation of a multi-cell symbol, 'none' = no-stitch cell
  rowsShown: 'all';                         // A-1; 'rsOnly' reserved
}

interface Pattern {
  id; schemaVersion; revision; meta: { title; designer?; sourceNote? };
  sizes: string[];                          // ['S','M','L',…] or ['one size']
  symbols: PatternSymbol[];                 // library ref + the pattern's own legend text
  charts: Chart[];
  stages: StageTemplate[];                  // per-size numbers via SizeValue = number | number[]
}

interface StageTemplate {
  id; name;                                 // 'Body', 'Back', 'Sleeve'
  construction: 'round' | 'flat';
  firstRowSide: 'RS' | 'WS';                // DR-7
  tracking: 'stitch' | 'rowCounter';        // DR-9
  layout: Segment[];                        // in WORK ORDER of an RS row: stitch 1 = first worked
  layoutChanges: { atRow: number; patch: LayoutPatch }[];   // FR-14, DR-6
  end: { kind: 'rows'; rows: SizeValue } | { kind: 'repeats'; placement: string; count: SizeValue }
     | { kind: 'openEnded'; targetCm?: SizeValue };          // DR-5
  startConstraint?: { kind: 'chartRowParity'; placement: string; parity: 'odd' | 'even' };  // DR-4
  inheritsFrom?: { stageId: string; stitchRange: [number, number] };   // DR-3
}

type Segment =
  | { kind: 'chart'; placementId: string; chartId: string;
      width: { mode: 'chart' } | { mode: 'stitches'; count: SizeValue; startCol: 'firstWorked' | number }; // DR-2
      rowPhase?: 'inherit' | { startRow: number } }
  | { kind: 'marker'; id: string; label?: string; segmentName?: string };  // 'Front' | 'Back'

interface Project {
  id; patternId; patternRevision; size: string;
  modifications: Modification[];            // DR-1: { kind:'substituteChart', placement|chart, withChartId } | { kind:'overrideCells', … }
  stageRuns: { stageId; rowsDone?: number; finishedAt? }[];
  position: { stageId: string; done: number };   // THE progress (FR-12)
  history: { undo: Position[]; redo: Position[] };   // capped at 500, persisted with the project
  view: { cellPx; visibleRows: number | 'stageEnd'; focusSegment?: string; theme?: 'light' | 'dark' | 'system' };
  rev: Revision;                            // ADR-4
}
```

**Progress math (pure functions in `core`).** A stage *resolves* into rows. Row *r* has
`cells_r`: the worked cells in **work order** (RS rows right→left in RS view, WS rows left→right),
with each cell's display column, symbol and placement. With prefix sums `P_r = Σ_{i<r} |cells_i|`,
`done` maps to (row, k) by binary search and back in O(log R). "Tap" = `done := P_r + k` (forward)
or the eraser rule, "Complete row" = `done := P_{r+1}`. Rows are generated lazily and memoized per
stage, so an open-ended stage just extends.

**Chart phase.** Each placement has an anchor, and its chart row for stage row *r* is
`((r - 1 + offset) mod height) + 1`. `offset` is inherited from the parent stage's placement
(DR-3), so "continue as before" holds across the split.

**Encoding.** Rows are stored as strings over the chart palette (compact, diff-friendly). A
500×300 chart takes ~150 kB of JSON. Glyphs are a tiny primitive DSL (`line`, `polyline`, `polygon`,
`circle`, `text`) in cell units, rendered identically to Canvas2D and SVG. No raw SVG strings, so
nothing can be injected.

**Validation (`core/validate`)** returns a list of diagnostics with severity:
1. Structure: multi-cell symbols fit and are followed by the right number of `cont` cells, no overlaps,
   palette closed.
2. **Count chain**: chart-local and stage-level. `produced(r) = consumed(r+1)`. Layout widths sum to
   the stage stitch count. Markers are within range.
3. **Flow lint** (warning): knit/purl kinds flowing through `flow` permutations. Intended
   texture changes show as low-severity notes. In the verification screen this list doubles as
   a recognition-error detector.
4. WS behaviour: any symbol on a WS row with `ws: unsupported` → error.
5. Property tests (fast-check): `invert∘invert = id`, mirror twice = identity, `done ↔ (row, k)` is
   a bijection, layout of random segment lists sums correctly, random edit sequences keep the
   chain valid or report it.

**Alternatives.** A boolean "done" matrix (prototype idea, explicitly rejected by the spec: big, and
undo is ambiguous). An event-sourced log of taps (overkill, because the position is the state).
Storing work order instead of RS view (it breaks WS inversion and editor symmetry).

**Consequences.** Pattern edits after progress exists can shift `done`. Rule: on a revision change,
the project keeps its **(stage, row, stitch-in-work-order)** coordinate and recomputes `done`. If that
coordinate no longer exists, it asks.
