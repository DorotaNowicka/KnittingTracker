# ADR-0005: Recognition architecture

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Decision.**

```ts
interface ChartRecognizer {
  readonly id: 'vector-pdf' | 'raster' | 'vision';
  canHandle(input: AnalyzedDocument): number;            // 0..1 suitability
  recognize(input: AnalyzedDocument, ctx: RecognizeCtx, signal: AbortSignal):
    AsyncIterable<RecognizeProgress | RecognitionResult>;
}
interface RecognitionResult {
  charts: Array<{ bbox; source: PageRef; width; height; nameGuess?: Scored<string>;
                  cells: Array<Array<{ candidates: Scored<SymbolId>[] }>>;   // per-cell confidence
                }>;
  legend: Array<{ icon: ImageRef | VectorRef; text?: string; match: Scored<SymbolId>[] }>;
  diagnostics: Diagnostic[];
}
```

Pipeline (in a worker, cancellable, with progress events):
1. **Ingest**: sniff magic bytes, enforce limits (NFR-5), open the PDF with pdf.js
   (`isEvalSupported:false`, no scripting, no XFA) or decode the image via `createImageBitmap`.
2. **Analyze document**: per page, collect text items with positions, image XObjects with
   transforms (from the operator list), and path segments.
3. **Legend**: pair legend icons and text lines by baseline. Each icon becomes a template, and its
   cell count comes from icon width ÷ the icon height (square cells). Then match each icon to the
   library (glyph rendered at icon scale → normalized cross-correlation) to propose a `SymbolId`.
4. **Recognizers**, ranked by `canHandle`:
   - **VectorPdfRecognizer**: cluster horizontal/vertical segments into grids, then classify path
     content per cell span against vector legend icons or library glyphs. Not applicable to
     `DROPS 246-2.pdf` (raster), but cheap to build and exact when it applies.
   - **RasterRecognizer**: binarize (Otsu for scans/prints, Sauvola for photos) → grid candidates via
     projection profiles and long-line components (validated by the spike) → refine line
     positions → per row, **dynamic-programming segmentation** that picks the
     non-overlapping sequence of (symbol, width) with the best total template score. Templates come
     from the **same document's legend** first, then library glyphs rendered at the measured cell
     pitch. Confidence = margin between the best and second-best candidate, calibrated on synthetic
     renders. Photos get a "crop & straighten" step first (auto-detected quad, user-adjustable).
   - **VisionRecognizer** (opt-in): disabled at build time unless `VITE_ENABLE_VISION=true`. The CSP
     `connect-src` is extended only in that build. It needs a key the user enters, which is stored only
     on the device, is never synced, and is redacted from logs. It also needs an explicit consent dialog
     saying the image leaves the device and may be copyrighted. The output is mapped to the same
     result type, with confidence capped (never "certain").
5. **Post-checks**: `core.validate` (count chain + flow lint). Cells involved in a warning get their
   confidence lowered, so the verification screen surfaces them.
6. **Names/widths**: from the text layer when present. For raster-only charts (as here), names come
   from the description parser's chart list, matched by width/height constraints. The user
   confirms names in the verification screen. OCR (tesseract.js, self-hosted, lazy) is **backlog**.
7. **DescriptionParser** (`pl` first): tokenizer → size header detection → hyphen-list ↔ size
   mapping → chart-sequence grammar ("A.x over N stitches", lists of charts, "end with the first
   stitch") → marker sentences. Each extracted value keeps its **source span** for highlighting, and
   everything is editable.

**Acceptance test (local, skipped if the file is absent):** `DROPS 246-2.pdf` → 4 charts with
dimensions 44×20, 14×22, 8×9, 3×9 → symbols matched to the legend → cell-diff against the
golden transcription (with the real A.1) **reported as a number**, target 0 for A.2–A.4.

**Alternatives.** A vision model by default (rejected: privacy and copyright). OpenCV.js (deferred,
see ADR-1). A server-side pipeline (rejected: files must stay local).

## Implementation notes (M4, 2026-10-16)

What was built, and where it differs from the plan above.

**Runs where.** `@kt/importer` is pure TypeScript with no DOM. The app runs it in one module
worker (`apps/web/src/import/worker.ts`). pdf.js 6.3 (legacy build) runs inside that worker as a
"fake worker" (`globalThis.pdfjsWorker`), so no second worker script or blob URL is needed under
the CSP. Options: `isEvalSupported: false`, `verbosity: 0`, no font loading, no XFA, no
scripting. The worker chunk (~1.9 MB) is lazy and precached by the service worker, so import works
offline. The only network request during an import is that chunk (asserted in e2e).

**Limits** (`UPLOAD_LIMITS`, checked in the UI before the worker and again inside it): 25 MB per
file, 30 PDF pages, 40 megapixels per image. Files are recognised by magic bytes, not extension.

**One recognizer instead of two.** Vector charts are rasterised by a small anti-aliased software
rasteriser (`raster/draw.ts`) and go through the raster path. This is exact enough (0 errors on
synthetic vector PDFs) and avoids a second classifier. `VectorPdfRecognizer` is not a separate
class. The vision recognizer was **not built** (still opt-in backlog; `VITE_ENABLE_VISION` has no
effect yet).

**Grid detection** (`raster/grid.ts`). Binarize, then keep long horizontal and vertical runs, take
connected components, find coverage peaks and the longest regular run of rule positions per axis,
and require square cells. Without a fixed threshold, both global (Otsu) and local (Sauvola)
binarization run (local only for dark images and photos), and where both find a grid the one with
more cells wins: a lost rule can only remove cells. Grids need ≥ 2×2 cells, regularity ≥ 0.6 and
mostly-paper cells (rejects lattices in photos).

**Cell classification** (`raster/classify.ts`).

- Every cell span is resampled to 20 px per cell. Ink is `(paper − grey) / (paper − ink)`,
  blurred 3×3, then clipped (clipping after the blur lets noise cancel out), with the cell rules
  masked out.
- The paper level is per cell: the median of the cell interior, then the maximum over its 3×3
  neighbourhood. This handles uneven light, and a shaded "no stitch" cell still gets its neighbours'
  paper level.
- Similarity `(2·a·b + ε) / (|a|² + |b|² + ε)` with ε = 3, which unlike NCC treats two empty cells
  as equal.
- Templates: the document's legend icons, plus library glyphs drawn at three stroke widths (0.09,
  0.15, 0.23 of a cell).
- Filled symbols ("no stitch") get a 0.3 penalty unless the patch is evenly dark (median ≥ ⅓ of the
  template's; lower quartile ≥ ½ the upper quartile). Without this, a thin ring (yarn-over) in a
  noisy photo was read as a grey fill.
- Rows are segmented by dynamic programming over (symbol, width). For close calls (margin < 0.12)
  the two templates are compared only on the pixels where they differ.
- Confidence = margin / 0.12, clipped to 0…1. Cells below **0.7** (`UNCERTAIN_BELOW`) are
  highlighted for the user. On noisy synthetic photos every misread cell is below 0.7. On the
  local DROPS acceptance no cell is below 0.8.

**Legend** (`legend/pair.ts`, `legend/text.ts`). An icon is paired with the text right of it
(`= …`). The Polish reader maps the wording to library symbols, including cable working steps
("slip 2 to the front, knit 2, …" → `cable:2-2-lc`). An entry counts as certain when the icon and
the text agree (confidence ≥ 0.6); otherwise the user picks the symbol, and recognition can be
re-run with the corrected legend.

**Names, description and draft.** Chart names come from the text layer above the grid when
present; otherwise they are `Schemat n` and the user names them (no OCR). The description parser
(`describe/parse.ts`, Polish) finds sizes, the chart sequence with partial repeats, the stitch
count and the marker, each with its source span. A description can come from the same PDF or from
a second file. `buildPattern` turns the confirmed result into a normal pattern; the marker is
placed only when it can split a filler chart.

**Photos.** The user drags four corners and a homography straightens the quadrilateral
(`raster/warp.ts`). Screenshots and scans skip this step.

**Measured.**

| Test                                                          | Result                         |
| ------------------------------------------------------------- | ------------------------------ |
| `DROPS 246-2.pdf` (local, skipped without the file)           | 4 charts 44×20, 14×22, 8×9, 3×9 |
| … cell differences vs golden A.1 / A.2 / A.3 / A.4            | 0 / 0 / 0 / 0                  |
| … legend entries with icon and text agreeing                  | 8 of 8                         |
| Synthetic charts, 5 drawing styles                            | 100 % cells                    |
| Synthetic raster and vector PDFs                              | 0 errors                       |
| Perspective photos with noise and gradient, after straightening (8 seeds) | 0 errors           |
| Faint noisy photos, 12×10, all default symbols (8 seeds)      | < 2 % errors, all flagged      |
