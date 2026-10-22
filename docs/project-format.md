# Project file format (`*.ktproject.json`)

A project file is UTF-8 JSON, validated with the zod schemas in
[`packages/core/src/schema/pattern.ts`](../packages/core/src/schema/pattern.ts) after migration to
the current schema version. Files that fail validation are rejected as a whole, with precise error
paths (e.g. `patterns.0.charts.2.rows`).

```jsonc
{
  "format": "knitting-tracker/project", // fixed
  "schemaVersion": 3,                   // bumped with every schema change; older files are migrated
  "exportedAt": "2026-10-22T20:00:00.000Z",
  "project": { /* Project, see below */ }
}
```

**Hierarchy (schema 3).** A **project** (projekt) is what is being knitted, e.g. a sweater. It holds
**patterns** (wzory) in knitting order, e.g. "Ribbing", "Body in the round", "Front", "Sleeve". A
pattern is **one grid**: its **charts** (schematy) side by side in one round or row, tracked with its
own progress. Patterns belong to their project; reusing one in another project is done by copying.

Files from a **newer** app version are refused rather than partially read. Older single-pattern
files (`"format": "knitting-tracker/pattern"`, schema 1–2) are still opened: they become a project
whose patterns are the former stages.

| Version | App | Change |
|---|---|---|
| 1 | M1–M4 | First format (`knitting-tracker/pattern`) |
| 2 | M5 (1.0) | Added (all optional): pattern `gauge`; stage `tracking` and `targetCm`; chart segment `continueFrom`; project `finishedRows` and `gauge` |
| 3 | 2.0 | Project → patterns → charts. Each former stage becomes a pattern (same id and name) with a copy of the charts it places (charts placed nowhere go to the first pattern), the custom symbols and the legend. Project-level chart replacements move to the patterns holding that chart. `continueFrom.stageId` → `continueFrom.patternId`. The knitter's `gauge` → `knitterGauge`. Progress per stage → progress per pattern. Conversion: `packages/core/src/legacy/convert.ts` |

Frozen v1 and v2 files live in `packages/test-fixtures/files/` and are opened by the migration tests.

## Conventions

| Topic | Rule |
|---|---|
| Chart orientation | Charts are stored as the **right-side (RS) view**: `rows[0]` is chart row 1 (bottom), and characters run **left → right as drawn** |
| Cells | One character per cell, mapped to a symbol id through the chart's `palette`. `.` is reserved: it continues the multi-cell symbol anchored to its left |
| Work order | Layout segments are listed in the **work order of an RS row**: stitch 1 is the first stitch worked, which is the rightmost one in the RS view |
| Per-size numbers | `SizeValue` = one number for all sizes, or a list with one number per entry of `sizes` |
| Symbol ids | Built-ins: `std:*`, `cable:*` (see `BUILTIN_SYMBOLS`). Pattern-defined: `user:*`. Catalogue numbers such as DROPS `401` are metadata only |

## Project

| Field | Type | Notes |
|---|---|---|
| `id`, `revision` | string, int | `revision` grows once per editing session |
| `name`, `designer?`, `notes?` | string | Free text written by the user |
| `sizes`, `sizeIndex` | string[], int | e.g. `["S","M","L"]`; `sizeIndex` is the size being knitted. Per-size numbers in patterns follow this list |
| `gauge?` | `{ stitches, rows }` | The designer's gauge in 10 cm (decimals allowed), used for length estimates |
| `knitterGauge?` | `{ stitches, rows }` | The knitter's own gauge; used instead of `gauge` when set |
| `patterns` | Pattern[] | In knitting order; may be empty in a new project |
| `activePatternId?` | string | The pattern the tracker opens |
| `finishedRows?` | `{ [patternId]: rows }` | Rows worked when the knitter finished an (open-ended) pattern |
| `createdAt`, `updatedAt` | ISO time | |

Progress is **not** part of project files; it travels in backups.

## Pattern

```jsonc
{
  "id": "body",
  "name": "Body",
  "construction": "round",          // or "flat"
  "firstRowSide": "RS",             // flat patterns may start on the wrong side
  "charts": [ /* Chart[], ids unique within the pattern */ ],
  "symbols": [ /* pattern-defined symbols (user:*) */ ],
  "legend": [{ "symbolId": "cable:2-2-lc", "number": "C4", "text": "…" }],
  "rows": 120,                      // optional: omit for open-ended patterns ("until 42 cm")
  "targetCm": [40, 42],             // optional, open-ended patterns: length to knit
  "expectedStitches": [250, 262],   // optional cross-check against the pattern text
  "tracking": "stitches",           // optional: "rows" = row counter only (ribbing, stockinette)
  "modifications": [],              // optional: the knitter's chart replacements, see below
  "layout": [
    { "kind": "marker", "id": "start", "sectionName": "Front" },
    { "kind": "chart", "placementId": "f1", "chartId": "seed", "stitches": [19, 22] },
    { "kind": "chart", "placementId": "c1", "chartId": "rope", "rowOffset": 0 },
    { "kind": "marker", "id": "side", "sectionName": "Back" }
    // …
  ]
}
```

- `symbols` have the same shape as built-ins: width, consumes/produces, optional knit/purl `flow`,
  WS behaviour, vector glyph, labels. `legend` links a symbol to the number/wording of the source.
- `modifications`: `{ "kind": "replaceChart", "chartId": "A.1", "chart": { … } }` shows other
  content for a chart everywhere it is placed (e.g. "A.1 in plain knit") without changing the chart
  as drawn or the stitch count.

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

### Layout

- A **chart segment** covers `stitches` stitches (default: the chart width). Stitches use chart
  columns starting at `startColumn` (default: the rightmost column, i.e. the first one worked) and
  moving left, wrapping around. This expresses partial repeats such as "over 22 stitches, ending
  with the first stitch of the chart".
- Vertically, row *r* of the pattern uses chart row `((r − 1 + rowOffset) mod height) + 1`, so every chart
  repeats on its own.
- **Continuing a chart from another pattern**: `"continueFrom": { "patternId": "body",
  "placementId": "c1" }` makes the placement start with the chart row after the last one worked in
  that placement of another pattern of the same project ("continue as before", e.g. the front after
  the split). The offset is that placement's own start plus the rows of its pattern: the planned
  `rows`, or, for an open-ended pattern, the rows the knitter recorded when finishing it. Chains (front → yoke) are followed; a missing
  source or a loop is an error. `continueFrom` overrides `rowOffset`.
- A **layout change** from a given row (decreases, increases, a split) is a new pattern after the
  current one whose placements continue the earlier ones (the project page's "Dalej z tego wzoru"
  builds it).
- A **row-counter pattern** (`"tracking": "rows"`) counts whole rows; its layout may be just a
  marker.
- A **marker** sits between stitches. `sectionName` names the part of the round that starts at it
  (e.g. Front/Back). To put a marker inside a filler, split the filler into two segments. When the
  first part is a whole number of repeats, the rhythm continues unchanged. Otherwise, give the second
  part a matching `startColumn`.

## Validation

`validatePattern(project, patternId)` and `validateProject(project)` report diagnostics with a
severity:

| Code | Severity | Meaning |
|---|---|---|
| `row-width`, `chart-height`, `unknown-cell`, `orphan-continuation`, `symbol-truncated`, `symbol-overflow` | error | Chart structure |
| `chain-break` | error | Row *r* produces a different number of stitches than row *r+1* consumes |
| `chain-wrap` | warning | The top row doesn't feed row 1, so the chart can't repeat vertically as is |
| `flow-cable` | warning | A cable is fed the wrong stitch kind (often a misread cell) |
| `flow-texture` | info | Knit/purl texture changes between rows (usually intended) |
| `stitch-count` | error | Layout total ≠ `expectedStitches` |
| `zone-cuts-symbol` | error | A partial repeat cuts through a multi-cell symbol |
| `ws-unsupported` | error | A symbol without a wrong-side form falls on a WS row of a flat pattern |
| `duplicate-*`, `unknown-chart`, `unknown-pattern`, `legend-unknown-symbol`, `size-list`, `size-index` | error | References and per-size lists |
| `continue-missing`, `continue-cycle` | error | `continueFrom` points to a placement that does not exist, or loops |
| `continue-unknown` | info | The source pattern is open-ended: the chart rows are known once the knitter finishes it. Until then the check assumes offset 0 |

## Backups (`*.ktbackup.json`)

```jsonc
{
  "format": "knitting-tracker/backup",
  "schemaVersion": 3,
  "exportedAt": "…",
  "projects": [{ /* Project */ }],
  "progress": [{ "projectId": "…", "patternId": "…", "done": 57, "undo": [], "redo": [], "updatedAt": "…" }]
}
```

Progress is one number per pattern, `done` (cells worked in work order; in row-counter patterns it
counts rows), with its undo/redo history. Each record is validated on its own; broken ones are
skipped and reported. Restoring never overwrites newer work: projects missing on the device are
added, projects newer in the backup (`updatedAt`) replace the device copy together with their
progress, and newer device projects stay. Schema 2 backups (with a separate pattern list) are
converted on reading; a pattern no project used becomes a project of its own.
