# Contributing

## Workflow

- Branch from the latest integration branch as `feat/<topic>`, `fix/<topic>` or `docs/<topic>`.
- Make **small, atomic commits** in [Conventional Commits](https://www.conventionalcommits.org/) form,
  e.g. `feat(core): add stitch-count chain validation`. Allowed scopes: `core`, `renderer`,
  `importer`, `fixtures`, `web`, `docker`, `ci`, `deps`, `docs`, `release`. `commitlint` enforces the format.
- **Never push or merge to `main` without the owner's approval.**
- Releases follow SemVer. `release-please` builds the release PR and `CHANGELOG.md` from the commit
  history on `main`.

## Before you commit

The pre-commit hook runs ESLint and Prettier on staged files and the forbidden-content check. Before
opening a PR, run the full pipeline:

```bash
pnpm ci:local
```

End-to-end tests run against the production build (`pnpm build`, then `pnpm e2e`), served by
`vite preview` with the production security headers. To test the real nginx configuration without
Docker (headers, caching, SPA fallback), serve the build with it and point the suite at it:

```bash
pnpm build && scripts/serve-nginx.sh
E2E_BASE_URL=http://localhost:8080 pnpm e2e
scripts/serve-nginx.sh stop
```

Without WebKit installed, `PW_NO_WEBKIT=1` runs the iPhone project in Chromium (reported as
unverified on WebKit). Screenshot tours for milestone reports: `KT_SCREENS=<dir> pnpm e2e`.

## Rules of the codebase

- **TypeScript strict** everywhere. `@kt/core` must not use the DOM, browser APIs, React or storage
  libraries (lint-enforced).
- `@kt/core` coverage must stay **≥ 90%**. New domain logic comes with unit tests and, where it
  makes sense, property-based tests (fast-check).
- No `innerHTML`/`outerHTML`, no `eval`/`new Function`. Every external input (files, storage, worker
  messages) is validated with zod.
- UI strings go through i18next (`apps/web/src/i18n/locales/*.json`): Polish first, English complete.
- Accessibility is part of "done": keyboard support, labels, contrast, and state that never relies on
  colour alone.

## Copyright

Never commit third-party pattern material (PDFs, chart transcriptions, legend texts, screenshots of
real patterns), including in test snapshots. Put such data in the git-ignored `local/` folder, and
write tests that skip when it is missing. Fixtures in `packages/test-fixtures` must be your own
invention.

## Decisions

Architectural changes need an ADR in `docs/adr/` (next number, Nygard format, linked from
`docs/adr/README.md`).
