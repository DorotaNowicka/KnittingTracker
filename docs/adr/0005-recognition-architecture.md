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
