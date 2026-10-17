# Performance (M6, 2026-10-17)

Budgets come from NFR-3 (a 500-stitch × 300-row grid must pan smoothly on an average tablet) and
from the knitter's use: the app must open fast and a tap must answer at once. All numbers below
were measured in Chromium with the **CPU throttled 4×** to stand in for a mid-range tablet, on the
production build, with the synthetic 500 × 300 pattern.

| Measure | Budget | Tablet viewport | Desktop viewport | Test |
|---|---|---|---|---|
| Grid frame cost while panning (scene + paint), p95 | < 16 ms | 5.8 ms | 5.5 ms | `e2e/perf.spec.ts` |
| Open a large project (reload → grid drawn) | < 3 s | 1.35 s | 1.37 s | `e2e/perf.spec.ts` |
| Tap → status updated, p95 (25 taps) | < 100 ms | 33 ms | 47 ms | `e2e/perf.spec.ts` |
| JavaScript needed to start (gzip) | ≤ 230 KiB | 196 KiB | | `pnpm check:bundle` (CI) |

## What keeps it fast

- **Canvas grid with a tile cache** (ADR-6): only the visible part is drawn; panning reuses
  cached tiles. With p95 well under the frame budget, **OffscreenCanvas was not needed**.
- **Progress is one number** per stage; positions come from memoized prefix sums, so a tap is
  O(log rows) and never rebuilds the grid.
- **Code splitting**: the import wizard with its 1.9 MB pdf.js worker and the pattern editor
  (pattern page, stage editor, chart editor) load when opened. The service worker precaches them,
  so they also open offline.
- **Fonts and assets are local** and hashed: after the first visit everything comes from the
  service worker cache.

## Known costs

- `zod` is the largest library in the start-up bundle (it validates every file and every stored
  record). `zod/mini` would be smaller but needs a rewrite of the schemas; not worth it at the
  current size.
- The import worker is large because of pdf.js; it is loaded only for an import.
- Real-device numbers (an actual iPad, an Android phone) were not measured here.
