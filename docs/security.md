# Security review (M6, 2026-10-17)

KnittingTracker is a static, local-first PWA: no accounts, no server-side code, no telemetry. The
data that matters is the user's patterns (often copyrighted) and progress, kept in the browser's
IndexedDB. This document lists what the app defends against, how, and how it was checked.

## Assets and trust boundaries

| Asset | Where it lives | Notes |
|---|---|---|
| Patterns, projects, progress | IndexedDB on the device; backup files the user saves | Never sent anywhere by the app |
| Imported PDFs and images | Memory of the import worker during an import | Not stored; never uploaded |
| App code | Same-origin static files, precached by the service worker | No CDN at runtime |

Untrusted input enters only through **files the user picks**: pattern files (`*.ktpattern.json`),
backups (`*.ktbackup.json`), PDFs and images. Nothing is fetched from other origins.

## Threats and controls

| Threat | Controls | Checked by |
|---|---|---|
| Script injection (XSS) from file content (titles, legend text, chart names) | React renders text only; no `innerHTML`/`dangerouslySetInnerHTML` anywhere; strict CSP `script-src 'self'` with no `unsafe-*`; **Trusted Types** (`require-trusted-types-for 'script'; trusted-types default`): HTML and script strings are rejected at every DOM sink, and script URLs pass one policy that allows only `/sw.js` and `/assets/*.js` of this origin | `e2e/security.spec.ts` (innerHTML and foreign script URLs are blocked; the app's flows cause no violation), `lib/trustedTypes.test.ts`; code search for `innerHTML`, `eval`, `new Function` |
| Malformed or hostile JSON files | Size limit (20 MB), `JSON.parse` only, migration then zod validation of every record; invalid files are rejected with readable errors, invalid backup records are skipped and listed; zod runs `jitless` (no `new Function`) | `io/file.test.ts`, `io/backup.test.ts`, `migrate-v1.test.ts` |
| Hostile PDFs and images | Type by magic bytes, limits (25 MB, 30 pages, 40 megapixels) checked before and inside the worker; pdf.js runs in a dedicated worker with `isEvalSupported: false`, no font loading, no XFA, no scripting; only operator lists, text and image data are read; the worker can be terminated (cancel) | `pipeline.test.ts` (limits), `e2e/import.spec.ts` (no network request during import) |
| Data leaving the device | `connect-src 'self'`; no analytics, no error reporting, no third-party requests; `Referrer-Policy: no-referrer`; `Permissions-Policy` denies camera, microphone, geolocation, payment, USB | e2e request assertions in the import test; CSP header check |
| Clickjacking, cross-origin attacks | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin` | `e2e/security.spec.ts` against nginx |
| Stale or poisoned app shell | `index.html`, `sw.js` and the manifest are `no-cache`; hashed assets are immutable; missing files are a real 404 (never the app shell, so the service worker cannot cache HTML as a script); updates wait for the user | `e2e/security.spec.ts` against nginx |
| Supply chain | Exact versions (`save-exact`), frozen lockfile in CI and Docker, Renovate for updates, `pnpm audit --prod --audit-level=high` in CI; no runtime CDN | `pnpm audit`: *No known vulnerabilities found* (2026-10-17) |
| Container | Multi-stage build; runtime is `nginx-unprivileged` as uid 101 on port 8080; CI runs it `--read-only --cap-drop ALL --security-opt no-new-privileges`; `server_tokens off`; the build context excludes `inspirations/`, `local/` and docs | CI Docker job (not run here, see below); `.dockerignore` |
| Copyrighted pattern material in the repo, image or logs | `inspirations/` and `local/` are git- and docker-ignored; `pnpm check:forbidden` (pre-commit and CI) blocks those paths, PDFs outside the test fixtures and copied pattern wording; logs contain no file content (only error objects, and only in the user's own browser console) | `scripts/check-forbidden.mjs` |
| Lost data | Local-first with `navigator.storage.persist()`, an in-memory fallback with a visible warning, full backups and a restore that never overwrites newer work | `e2e/stages.spec.ts` (backup → delete → restore) |

## Found by CI on WebKit (2026-10-17)

The first run in GitHub Actions (real WebKit) reported `style-src-attr` violations: Safari counts
inline styles set from script (React `style` props) against `style-src 'self'`, which Chromium does
not. Instead of loosening the policy, the app now sets **no inline styles**: chart thumbnails and
legend icons are images sized by attributes, the photo corner handles are SVG positioned by
attributes, and proportional boxes use an SVG spacer. `e2e/security.spec.ts` fails if any element
on the main screens gets a `style` attribute.

## Accepted risks

- **IndexedDB is not encrypted** by the app. It is protected by the device and browser profile.
  Backup files are plain JSON: whoever has the file can read the patterns in it. The settings page
  says where data lives; a passphrase for backups is a possible later addition.
- **Trusted Types** are enforced in Chromium-based browsers and recent Safari. Firefox ignores the
  directive; there the CSP and React's escaping remain the controls.
- **pdf.js** is a large parser. It runs isolated in a worker without eval, on files the user chose,
  and its version is pinned and updated by Renovate.
- **No CSP reporting endpoint**: reporting would send data off the device, which the app avoids by
  design.
- **HTTPS and HSTS** are the job of the reverse proxy in front of the container (ADR-7); the
  container itself serves plain HTTP on 8080.

## How it was verified in M6

- The production nginx configuration from `docker/nginx/` was run locally (nginx 1.24; the image
  uses 1.29) and the **whole e2e suite** (70 tests on phone, tablet and desktop viewports) ran
  against it, including the header and caching checks.
- `vite preview` sends the same security headers (read from the same file), so every ordinary e2e
  run also happens under the production CSP with Trusted Types.
- **Not verified here**: the Docker image build (Docker Hub is not reachable from the build
  environment). The CI job builds and smoke-tests it on every push.
