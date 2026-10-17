# ADR-0001: Stack and platform

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Context.** Strict TypeScript, a monorepo, a PWA first, accessible touch UI, an
assistive-technology-friendly surround for a canvas, i18n with Polish plurals, a heavy worker-based
importer, and tests at every level.

**Decision.**
- **pnpm workspaces** + **Vite**. Node **24 LTS** in CI/Docker (the dev machine has Node 22, which also
  works; `engines` allows ≥22).
- **React** (current stable) + **React Aria Components** for accessible primitives (slider, toggle,
  dialog, menu, grid-like keyboard patterns). **zustand** for UI state (small, selector-based,
  no providers). **React Router** (library mode) for the ~6 routes.
- **i18next + react-i18next** (Intl.PluralRules handles Polish *one/few/many*). Message keys in
  English. `pl` is the default locale, `en` complete for UI strings.
- **zod** for every external boundary (files, storage reads, worker messages).
- **Dexie** (IndexedDB). **vite-plugin-pwa** (Workbox, `injectManifest`).
- **pdfjs-dist** inside the importer worker. **comlink** for typed worker RPC.
- Image processing: **own TypeScript code** on `ImageData`/typed arrays (binarization, projections,
  homography, normalized cross-correlation). OpenCV.js (~8 MB wasm) is rejected for now and
  reconsidered only if photo rectification proves insufficient.
- Tests: **Vitest** (+ v8 coverage), **fast-check**, **Testing Library**, **Playwright**
  (3 viewports, WebKit + Chromium), **@axe-core/playwright**, Playwright screenshot comparison
  for visual regression (run in the pinned Playwright Docker image for deterministic fonts).
- Tooling: ESLint (flat config, typescript-eslint, jsx-a11y, import boundaries), Prettier, husky +
  lint-staged, commitlint (Conventional Commits), **release-please** for SemVer/CHANGELOG (runs on
  GitHub, harmless until pushed), Renovate.
- Fonts self-hosted (Fontsource packages). Typography is chosen in `docs/design.md` (M2).
- Exact dependency versions are pinned when M0 installs them (`save-exact`, lockfile committed).

**Platform: PWA only.** Capacitor/native adds nothing v1 needs: Wake Lock, file input, share sheet
(Web Share Level 2), offline and IndexedDB are all available on the web. iOS storage separation
and eviction (R-3) are mitigated by installation and backups. Revisit only if a concrete missing
capability appears (e.g. background sync on iOS).

**Alternatives.** Svelte 5: smaller bundle and pleasant reactivity, but a thinner accessible-component
ecosystem and fewer testing-library precedents. The grid is canvas anyway, so the framework mostly
renders chrome, and accessibility maturity outweighs bundle size. SolidJS: same argument, smaller
ecosystem. Lingui instead of i18next: nicer extraction, but i18next is good enough and well-known.

**Consequences.** Slightly larger JS bundle (roughly 60 kB gz for React + ReactDOM, plus the React Aria components used). The importer and pdf.js are
lazy-loaded so they do not affect the tracker's startup time.

## Implementation notes (M0, 2026-10-15)

Exact versions were pinned when M0 installed them. Deviations from "latest" and why:

- **TypeScript 6.0.x, not 7.x.** TypeScript 7 (native compiler) is out, but `typescript-eslint`
  8.x supports `typescript >=4.8.4 <6.1.0`. Revisit when typescript-eslint supports 7.
- **ESLint 9.x, not 10.x.** `eslint-plugin-jsx-a11y` declares ESLint ≤ 9 as peer.
- **jsdom 29.x and lint-staged 16.x.** Newer majors require Node ≥ 22.22.1/22.22.2, which is newer than
  some local Node 22 installs. `engines` in the root is `>=22.12.0`. CI and Docker use Node 24.
- **pnpm 10.28.0** via `packageManager` (corepack).
- **Playwright 1.64.x**. In the sandbox used for development, only a preinstalled Chromium is available
  (`PW_CHROMIUM_PATH`, `PW_NO_WEBKIT=1`). WebKit (iPhone project) runs only in CI.
- React Aria Components, zustand, React Router, Dexie, zod and comlink are installed in the milestone
  that first uses them, not in M0.
