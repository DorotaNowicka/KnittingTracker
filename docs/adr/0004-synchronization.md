# ADR-0004: Synchronization

- **Status:** Accepted (2026-10-15)
- **Origin:** Phase 0 analysis (`docs/00-analysis.md` §7)

**Context.** Several devices, one knitter, tiny data (KBs per project), copyrighted pattern content,
and no backend wanted unless it is justified.

**Decision (v1).** A `SyncAdapter` interface:

```ts
interface SyncAdapter {
  pull(since: Cursor): Promise<{ changes: Doc[]; cursor: Cursor }>;
  push(changes: Doc[]): Promise<PushResult>;   // per-doc accepted | conflict(remoteDoc)
  status(): SyncStatus;
}
```

The v1 implementations are `LocalOnlySync` (no-op) and **file transfer**: export/import a backup or a
single project, using the share sheet. No server in v1 *(default, Q4)*.

**Conflict model** (designed now, so that local data already carries the fields). Every doc has
`rev = { hlc, deviceId, parentHlc }`.
- Progress: if one side's `parentHlc` chain contains the other's `hlc`, the newer one wins
  (fast-forward). Otherwise it is a **true conflict**, and the UI shows both positions ("Tablet: row 41,
  stitch 12 · Phone: row 40, stitch 3") and lets the user pick. Plain `max(done)` is wrong because the
  eraser and undo go backwards (G3).
- Patterns: last-writer-wins per document, and the losing revision is kept as a recoverable copy.

**Options for M6 (decided then, with your input):**

| Option | Pros | Cons |
|---|---|---|
| (B) Own minimal API: Fastify + SQLite/Postgres, passkey or magic-link login, **E2E-encrypted blobs** (key derived on device and shared by QR) | Full control. The same Docker deployment. The server never sees pattern content | We run an auth service. Email deliverability for magic links. Ongoing ops |
| (C) User's own cloud storage (Google Drive `appDataFolder` / Dropbox app folder) via OAuth PKCE, client-side only | No server and no data custody | OAuth app registration and verification. CSP opens to the provider. Provider lock-in |
| (D) Hosted sync engine (PowerSync, Triplit, Jazz…) | Fast to build | Third party holds data. Cost. Conflicts with "private and local" |

Recommendation for M6: **(B) with E2E encryption**. If you don't want to run a server, (C).

## Owner decision (2026-10-15)

Q4 answer: the app stays **local for now**. No sync server in v1. The choice between options (B)
and (C) is made when the app moves to the internet.
