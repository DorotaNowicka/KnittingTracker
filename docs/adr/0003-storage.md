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
- **Files**: `*.ktpattern.json` (one pattern; since schema 3 `*.ktproject.json`), `*.ktbackup.json` (everything). zod-validated, with an
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


## Projects with patterns (schema 3, 2026-10-22)

- **Tables.** Dexie `version(2)` adds `projects3` (a project with its patterns and charts) and
  `progress3` (key `[projectId+patternId]`); `version(3)` drops the 1.0 tables `patterns`,
  `projects` and `progress`. New tables were needed because IndexedDB can't change a primary key
  in place. The upgrade reads the 1.0 tables and converts them with `migrateBackupDoc`, the same
  function that converts 1.0 backups, so both paths give the same result (tested on the frozen v2
  backup).
- **Files.** `*.ktproject.json` (one project without progress) and `*.ktbackup.json` (projects and
  progress). Older `*.ktpattern.json` files are still read and become projects.
- **One write path.** Every change to a project goes through the library's
  `updateProject(id, latest => next)`, queued per project. The editors keep a debounced draft and
  write only the top-level fields they changed (a three-way merge against the copy they loaded), so
  the tracker's changes (active pattern, finished rows, own gauge) are never overwritten. The
  tracker writes pending editor changes before it builds its grid.
