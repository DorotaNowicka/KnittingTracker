# ADR-0003: Storage

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Decision.**
- IndexedDB via Dexie. Tables: `patterns`, `projects` (without hot fields), `progress` (hot, tiny:
  position + history + rev, written on every tap in its own transaction), `assets` (original import
  files as Blobs, local only, for the verification screen), `settings`, `meta` (schema version, last
  backup time).
- A `StorageAdapter` interface with `IdbStorage` and an `InMemoryStorage` fallback. Every call is in
  try/catch. If IDB fails at startup, the app runs in memory and shows a persistent non-dismissable
  banner "Postęp nie zostanie zapisany".
- `navigator.storage.persist()` is requested when the first project is created, and the result is shown in settings.
- Writes on every progress change (no debounce; one tiny record), flushed again on
  `visibilitychange`/`pagehide`. A service-worker update waits for the next navigation and never
  reloads mid-session.
- **Schema versioning**: `schemaVersion` on every stored object and every exported file. Migrations
  are pure `core` functions `vN → vN+1`, tested on frozen fixtures of each released version. Dexie
  version upgrades call the same functions.
- **Files**: `*.ktpattern.json` (one pattern), `*.ktbackup.json` (everything). zod-validated, with an
  explicit `format` + `schemaVersion` header. Export uses the share sheet where available (AirDrop to
  the tablet), otherwise a download.
