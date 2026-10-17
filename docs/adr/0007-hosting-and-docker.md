# ADR-0007: Hosting and Docker

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Context.** v1 is a static PWA. Docker is for delivering and deploying the web part. A phone does
not need it.

**Decision.**
- **Multi-stage Dockerfile**: `node:24-alpine` (corepack pnpm, `pnpm fetch` + offline install for
  layer caching) → build → `nginxinc/nginx-unprivileged:alpine` (uid 101, port 8080). Image
  contains only `dist/` + nginx config. A read-only root filesystem works (tmpfs for nginx temp dirs).
- **nginx config**: `gzip_static on` (Vite precompresses `.gz`; `.br` is skipped unless a Brotli-enabled
  image is chosen) plus on-the-fly gzip for the rest. Cache: `/assets/*` (hashed) →
  `public, max-age=31536000, immutable`. `index.html`, `sw.js`, `manifest.webmanifest`,
  `registerSW.js` → `no-cache`. SPA fallback to `index.html`. `GET /healthz` → 200.
- **Security headers**: `Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self';
  worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none';
  frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`. Plus
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`
  (camera/mic/geolocation off; `screen-wake-lock=(self)`), `Cross-Origin-Opener-Policy: same-origin`.
  HSTS is set by the TLS-terminating proxy, not by this container. Trusted Types are tried in M6 (pdf.js
  compatibility needs checking).
- **Healthcheck**: `wget -qO- http://127.0.0.1:8080/healthz` in the Dockerfile and compose.
- **Compose**: `compose.yaml` with profile `dev` (Vite dev server in `node` with the source
  bind-mounted, HTTPS via `@vitejs/plugin-basic-ssl` so phones on the LAN can test the SW and Wake
  Lock) and profile `prod` (the built image, read-only, `cap_drop: [ALL]`,
  `security_opt: [no-new-privileges:true]`).
- Environments: `dev`, `test` (e2e against `vite preview` or the image), `prod`. Config via
  `VITE_*` build-time vars (only non-secret flags: `VITE_ENABLE_VISION`, `VITE_APP_ENV`) and an
  `.env.example`. **No runtime secrets exist in v1.**
- TLS and the domain are outside the image (reverse proxy, e.g. Caddy/Traefik, or a PaaS). The same
  `dist/` also deploys to any static host. Header parity is provided by a generated `_headers` file.
- No API container in v1 (ADR-4). If M6 adds sync, it becomes a separate `apps/api` image and compose
  service.

## Owner decision and M0 notes (2026-10-15)

- Q4 answer: **local only for now**. `compose.yaml` provides `prod` (built image on
  `http://localhost:8080`) and `dev` (Vite with HTTPS for phones on the LAN). Public hosting is
  decided when the app is ready.
- The IPv6 `listen [::]:8080` line was dropped: it fails on hosts without IPv6, and the image is
  meant for local use behind a proxy.
- File-like paths that do not exist return 404 instead of `index.html`, so the service worker can never
  cache HTML under a script URL.
- `upgrade-insecure-requests` is intentionally **not** in the CSP. It would break the plain-HTTP local
  profile. HSTS/HTTPS belong to the TLS proxy.
