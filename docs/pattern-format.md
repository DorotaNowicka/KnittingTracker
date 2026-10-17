# Pattern file format (`*.ktpattern.json`)

A pattern file is UTF-8 JSON, validated with the zod schemas in
[`packages/core/src/schema/pattern.ts`](../packages/core/src/schema/pattern.ts) after migration to
the current schema version. Files that fail validation are rejected as a whole, with precise error
paths (e.g. `charts.2.rows`).

```jsonc
{
  "format": "knitting-tracker/pattern", // fixed
  "schemaVersion": 2,                   // bumped with every schema change; older files are migrated
  "exportedAt": "2026-10-15T20:00:00.000Z",
  "pattern": { /* Pattern, see below */ }
}
```

Files from a **newer** app version are refused rather than partially read.

| Version | App | Change |
|---|---|---|
| 1 | M1–M4 | First format |
| 2 | M5 | Added (all optional): pattern `gauge`; stage `tracking` and `targetCm`; chart segment `continueFrom`; project `finishedRows` and `gauge`. A v1 file is valid v2 content unchanged. The version still went up so that an older app refuses v2 files instead of silently dropping the new fields |

Frozen v1 files live in `packages/test-fixtures/files/v1/` and are opened by the migration tests.

## Conventions

| Topic | Rule |
|---|---|
| Chart orientation | Charts are stored as the **right-side (RS) view**: `rows[0]` is chart row 1 (bottom), and characters run **left → right as drawn** |
| Cells | One character per cell, mapped to a symbol id through the chart's `palette`. `.` is reserved: it continues the multi-cell symbol anchored to its left |
| Work order | Layout segments are listed in the **work order of an RS row**: stitch 1 is the first stitch worked, which is the rightmost one in the RS view |
| Per-size numbers | `SizeValue` = one number for all sizes, or a list with one number per entry of `sizes` |
| Symbol ids | Built-ins: `std:*`, `cable:*` (see `BUILTIN_SYMBOLS`). Pattern-defined: `user:*`. Catalogue numbers such as DROPS `401` are metadata only |

## Pattern

| Field | Type | Notes |
|---|---|---|
| `id`, `revision` | string, int | `revision` grows with every edit; projects remember which revision they were made for |
| `title`, `designer?`, `notes?` | string | Free text written by the user |
| `sizes` | string[] | e.g. `["S","M","L"]`, or `["one size"]` |
| `gauge?` | `{ stitches, rows }` | Stitches and rows in 10 cm, as the pattern states them (decimals allowed). Used for length estimates |
| `symbols` | CustomSymbol[] | Pattern-defined symbols (`user:*`), same shape as built-ins: width, consumes/produces, optional knit/purl `flow`, WS behaviour, vector glyph, labels |
| `legend` | `{ symbolId, number?, text? }[]` | The pattern's own legend: links a symbol to the number/wording used by that pattern |
| `charts` | Chart[] | See below |
| `stages` | Stage[] | At least one |

### Chart

```json
{
  "id": "rope",
  "name": "R",
  "width": 6,
  "height": 6,
  "palette": { "k": "std:k", "p": "std:p", "C": "cable:2-2-lc" },
  "rows": ["pC...p", "pkkkkp", "pkkkkp", "pkkkkp", "pkkkkp", "pkkkkp"]
}
```

`C...` is one 4-cell cable: the anchor `C` plus three continuation cells. "No stitch" cells use a
palette entry mapped to `std:none`.

### Stage

```jsonc
{
  "id": "body",
  "name": "Body",
  "construction": "round",          // or "flat"
  "firstRowSide": "RS",             // flat stages may start on the wrong side
  "rows": 120,                      // optional: omit for open-ended stages ("until 42 cm")
  "targetCm": [40, 42],             // optional, open-ended stages: length to knit (decimals allowed)
  "expectedStitches": [250, 262],   // optional cross-check against the pattern text
  "tracking": "stitches",           // optional: "rows" = row counter only (ribbing, stockinette)
  "layout": [
    { "kind": "marker", "id": "start", "sectionName": "Front" },
    { "kind": "chart", "placementId": "f1", "chartId": "seed", "stitches": [19, 22] },
    { "kind": "chart", "placementId": "c1", "chartId": "rope", "rowOffset": 0 },
    { "kind": "marker", "id": "side", "sectionName": "Back" }
    // …
  ]
}
```

- A **chart segment** covers `stitches` stitches (default: the chart width). Stitches use chart
  columns starting at `startColumn` (default: the rightmost column, i.e. the first one worked) and
  moving left, wrapping around. This expresses partial repeats such as "over 22 stitches, ending
  with the first stitch of the chart".
- Vertically, stage row *r* uses chart row `((r − 1 + rowOffset) mod height) + 1`, so every chart
  repeats on its own.
- **Continuing a chart from an earlier stage**: `"continueFrom": { "stageId": "body",
  "placementId": "c1" }` makes the placement start with the chart row after the last one worked in
  that placement ("continue as before", e.g. the front after the split). The offset is that
  placement's own start plus the rows of its stage: the planned `rows`, or, for an open-ended stage,
  the rows the knitter recorded when finishing it. Chains (front → yoke) are followed; a missing
  source or a loop is an error. `continueFrom` overrides `rowOffset`.
- A **layout change** from a given row (decreases, increases, a split) is a new stage after the
  current one whose placements continue the earlier ones (the editor's "Zmiana układu" builds it).
- A **row-counter stage** (`"tracking": "rows"`) counts whole rows; its layout may be just a
  marker.
- A **marker** sits between stitches. `sectionName` names the part of the round that starts at it
  (e.g. Front/Back). To put a marker inside a filler, split the filler into two segments. When the
  first part is a whole number of repeats, the rhythm continues unchanged. Otherwise, give the second
  part a matching `startColumn`.

## Validation

`validatePattern` reports diagnostics with a severity:

| Code | Severity | Meaning |
|---|---|---|
| `row-width`, `chart-height`, `unknown-cell`, `orphan-continuation`, `symbol-truncated`, `symbol-overflow` | error | Chart structure |
| `chain-break` | error | Row *r* produces a different number of stitches than row *r+1* consumes |
| `chain-wrap` | warning | The top row doesn't feed row 1, so the chart can't repeat vertically as is |
| `flow-cable` | warning | A cable is fed the wrong stitch kind (often a misread cell) |
| `flow-texture` | info | Knit/purl texture changes between rows (usually intended) |
| `stitch-count` | error | Layout total ≠ `expectedStitches` |
| `zone-cuts-symbol` | error | A partial repeat cuts through a multi-cell symbol |
| `ws-unsupported` | error | A symbol without a wrong-side form falls on a WS row of a flat stage |
| `duplicate-*`, `unknown-chart`, `legend-unknown-symbol`, `size-list` | error | References and per-size lists |
| `continue-missing`, `continue-cycle` | error | `continueFrom` points to a placement that does not exist, or loops |
| `continue-unknown` | info | The source stage is open-ended: the chart rows are known once the knitter finishes it. Until then the pattern check assumes offset 0 |

## Projects (not part of pattern files)

A project is the user's instance of a pattern: size, active stage, **modifications** (e.g. replace a
chart's content everywhere without changing stitch counts), progress per stage
(`{ done, undo[], redo[] }`; in row-counter stages `done` counts rows), `finishedRows` (stage id →
rows worked when the knitter finished it) and an optional own `gauge`.

### Backups (`*.ktbackup.json`)

```jsonc
{
  "format": "knitting-tracker/backup",
  "schemaVersion": 2,
  "exportedAt": "…",
  "patterns": [{ "id": "…", "pattern": { /* Pattern */ }, "source": "file", "importedAt": "…", "updatedAt": "…" }],
  "projects": [{ /* Project without progress */ }],
  "progress": [{ "projectId": "…", "stageId": "…", "done": 57, "undo": [], "redo": [], "updatedAt": "…" }]
}
```

Each record is validated on its own; broken ones are skipped and reported. Restoring never
overwrites newer work: records missing on the device are added, records newer in the backup
(`updatedAt`) replace the device copy together with their progress, and newer device records stay.
