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

## Implementation notes (M5, 2026-10-17)

- **Stored records = backup records.** The record shapes (`StoredPattern`, `StoredProject`,
  `StoredProgress`) are zod schemas in `@kt/core` (`io/backup.ts`). The database, backups and
  restore all validate with the same schemas.
- **Versioning in practice.** Exported files carry `schemaVersion` (now 2). Stored records do not
  carry a version yet: every change so far was additive, so a v1 record is a valid v2 record. The
  first non-additive change adds a Dexie `version(2).upgrade()` that runs the same `core`
  migrations over the stored records. Migration tests open frozen v1 files
  (`packages/test-fixtures/files/v1/`), which are never regenerated.
- **Backups.** Export writes every pattern, project and progress record. Restore reads the file
  record by record (broken entries are skipped and listed), then plans: *add* what the device does
  not have, *update* what is newer in the backup (by `updatedAt`, with the project's progress),
  *keep* what is newer on the device, and skip projects whose pattern is in neither place. The plan
  is shown before anything is written.
- **Not built**: the `assets` table for original import files (the import keeps them only in memory
  for the verification screen) and the `meta` table (no last-backup reminder yet).

