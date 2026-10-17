# Release 1.0.0 — readiness (2026-10-17)

The definition of done comes from the project specification. Each item lists the evidence and what
was **not** verified. "Local" tests use private files in the git-ignored `inspirations/` and
`local/` folders; they skip themselves when those files are absent, so they run only on the
owner's machine.

## Definition of done

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | A user uploads a PDF or an image (or builds a pattern by hand), corrects the recognition and has a working grid within minutes | Done | `e2e/import.spec.ts` (synthetic PDF and photo → verification → pattern → project), `e2e/editor.spec.ts` (pattern from scratch → project); recognition takes about 1.5 s for the test files |
| 2 | Progress survives a reload, offline use and an app update; optional sync | Done (sync: local only by decision) | `e2e/tracker.spec.ts` (reload, offline), `e2e/update.spec.ts` (new service worker, update accepted, progress kept), `e2e/stages.spec.ts` (backup → restore). Sync: `SyncAdapter` with the local-only implementation (ADR-4, owner's decision Q4) |
| 3 | The recreated Ocean Ropes M matches the transcription and passes the consistency test | Done (local) | `packages/core/src/__tests__/golden-ocean-ropes.test.ts` with `local/golden/` |
| 4 | Importing `DROPS 246-2.pdf` finds A.1–A.4, and a report shows how many cells needed correction | Done (local) | `packages/importer/src/pipeline.test.ts`: 4 charts 44×20, 14×22, 8×9, 3×9; cell differences vs the golden copy A.1/A.2/A.3/A.4 = 0/0/0/0; no cell below the uncertainty threshold |
| 5 | The frontend is clear on phone, tablet and desktop in both themes, with screenshots in the reports | Done, with a design revisit pending | Screenshot tours for every milestone (3 viewports × 2 themes); axe clean in both themes (`e2e/a11y.spec.ts`). The owner asked to revisit the visual style (softer, wool-like) at the end: **open** |
| 6 | CI is green, the app builds into a Docker image, and a stranger can run it from the docs in minutes | Partly verified | All CI steps pass locally (format, lint, typecheck, unit tests with the coverage gate, build, bundle budget, e2e, audit). The production nginx config was tested with the whole e2e suite. **Not run here**: GitHub Actions itself (nothing is pushed) and the Docker image build (Docker Hub unreachable from the build environment) |
| 7 | The list of unverified items and open decisions is public | Done | This file, `docs/accessibility.md`, `docs/security.md`, `docs/performance.md` |

## Test totals at release

- Unit and component tests: 226 (Vitest), `@kt/core` coverage gate ≥ 90 % met.
- End-to-end (Playwright, four projects: iPhone viewport, Android, tablet, desktop): 77 tests
  pass against `vite preview` and 81 against the production nginx configuration (the header
  checks run only there). Screenshot tours and viewport-specific tests are skipped by design.
- Local acceptance (owner's machine): DROPS 246-2 import and the Ocean Ropes golden pattern.

## Not verified

- **Safari / WebKit** and **real devices** (iPhone, iPad, Android phone): the build environment
  has Chromium only; the iPhone viewport ran in Chromium. CI runs WebKit once the repository is
  pushed.
- **Docker image build and run**; GitHub Actions runs.
- **Screen readers** (VoiceOver, TalkBack) with a person.
- **Real photos** of charts from a phone camera (recognition was tested on synthetic photos with
  perspective, noise and uneven light, and on the DROPS PDF).
- **Performance on real hardware** (measured with the CPU throttled 4× in Chromium).

## Open decisions for the owner

1. **Visual design revisit** (agreed earlier: at the end). The current look is the M2 design.
2. **Merging to `main` and tagging `v1.0.0`**: the work is on feature branches
   (`feat/phase-0-analysis` … `feat/m6-hardening`); nothing is merged or pushed without consent.
3. **Hosting and sync** when the app goes online: options in ADR-4 (own end-to-end encrypted API,
   or the user's own cloud storage).
4. **Start constraints as data** (DR-4) and **free panning on touch without dragging**
   (`docs/accessibility.md`): both possible follow-ups.
5. **OCR for chart names** in raster-only PDFs (backlog in `docs/00-analysis.md`).
