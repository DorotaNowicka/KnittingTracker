# Design direction

## Brief, restated

- **Who**: someone knitting from a chart. Needles are in their hands, the phone lies on the sofa
  arm, or the tablet leans against their knees. They look at the screen for a second, find their
  place, knit, and tap.
- **Job of the UI**: show *where I am* instantly, and make marking stitches accurate and reversible.
  Everything else is secondary.
- **Character** (spec F4): warm, calm, crafted, textile, natural yarn colours, modern and sparing.
  It must not look like a SaaS template.

## Concept: chart paper and a magnetic row keeper

Knitters already have a physical tool for this job: a **magnetic chart keeper**, a board with a
magnetic strip laid just above the row being worked. Paper charts look like **graph paper** printed
in ink. The app takes both literally:

- The grid is ink on paper: thin warm-grey rules, crisp black symbols, and zone tints like faint
  pencil shading.
- **The one bold element is the row keeper**: a solid indigo strip that sits on top of the current
  row with a direction arrow in it. Rows above it are slightly veiled, as if covered by the magnet.
  Done rows below are "knitted": tinted with an indigo wash and a fine diagonal hatch, so they read
  as done in greyscale too.
- The last done stitch carries a **stitch marker**: a saffron ring with a small tab, the
  colour real plastic markers often are.

Everything around the grid is quiet: plain type, few lines, no card grids and no decorative gradients.

## Tokens

Colours are designed separately for each theme. The dark theme ("knitting at night") lowers glare
without washing out the symbols.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#EDEFEA` linen grey | `#1A1D21` slate | App background |
| `--sheet` | `#FBFBF8` | `#22262B` | Grid paper, panels |
| `--ink` | `#1E2227` | `#E7E9E4` | Text, symbols |
| `--ink-muted` | `#585F68` | `#A6ACB4` | Secondary text (AA on paper/sheet) |
| `--rule` | `#AEB2A8` | `#4A515A` | Grid rules (graph-paper weight), dividers |
| `--rule-strong` | `#5E646C` | `#9AA1AA` | Zone borders, marker lines |
| `--zone` | `#E2E6DC` | `#272C33` | Zone header tint |
| `--indigo` | `#2D4A7E` | `#93ABDB` | Primary actions, row keeper, focus |
| `--on-indigo` | `#FFFFFF` | `#14181D` | Text on indigo |
| `--done` | `#CFDAEE` | `#2E3C58` | Knitted cells |
| `--done-hatch` | `#4F69A0` | `#7F98C8` | Diagonal hatch over knitted cells (≥ 3.8:1 against `--done`) |
| `--marker` | `#D8961A` | `#F0B840` | Stitch marker (last done stitch) |
| `--danger` | `#A3322A` | `#F08A80` | Eraser on, destructive actions |

Indigo is a yarn dye. It replaces the usual terracotta, and on the grid it doesn't fight black
symbols. The saffron marker is the only warm accent and appears in exactly one place.

**Type**: one family, **Atkinson Hyperlegible Next** (variable, self-hosted, latin + latin-ext for
Polish). It was designed for low-vision legibility and has unambiguous digits. That matters more here
than anywhere: row and stitch numbers are read at arm's length.

- Scale (1.25): 13 · 15 · 17 (body) · 21 · 26 · 33 px.
- Numbers use `font-variant-numeric: tabular-nums`. The status line sets the current row and stitch
  large (26–33 px, weight 650), with small regular labels.
- Sentence case everywhere. No all-caps labels and no letter-spaced eyebrows.

**Space**: 4-px base (4, 8, 12, 16, 24, 32, 48). **Radii** follow hierarchy: 6 px controls, 12 px
sheets and dialogs, full radius only for the round icon buttons. **Shadows**: one level, only for
things that float above the grid (bottom bar, sheets). **Motion**: 120–180 ms ease-out for state
answers (keeper moving to the next row, sheet opening). None with `prefers-reduced-motion`.

## Themes

Light and dark stay the defaults ("Jak w systemie" follows the device). Five more themes are
chosen in **Settings only**, as tiles whose preview is painted with that theme's own tokens
(`data-theme-preview`). Every theme sets every colour token in `src/styles/tokens.css`, and
`src/styles/themes.test.ts` re-checks the contrast floors of the Accessibility notes for each one.
The roles keep their meaning in every theme: `--indigo` is the row keeper and primary action (the
token name is historical), `--marker` the stitch marker, `--done`/`--done-hatch` knitted cells.

| Id | Name (pl) | Scheme | For | Keeper / marker |
|---|---|---|---|---|
| `light` | Jasny | light | Default: linen paper, graphite, indigo | indigo / saffron |
| `dark` | Ciemny | dark | Evening, low glare | soft indigo / saffron |
| `moss` | Mech | light | Daylight; undyed wool and green tweed | moss / rust |
| `indigo` | Indygo | dark | A dark theme with character; ecru ink | madder coral / gold |
| `lamp` | Przy lampie | dark | Late evening next to someone resting: amber on brown, almost no blue light | amber / ember |
| `yarn` | Kłębek (premium) | light | Oatmeal wool with a stockinette texture, ginger kitten | chestnut / dusty rose |
| `yarn-night` | Kłębek nocą (premium) | dark | The same kitten on charcoal-brown wool | ginger / rose |

"Premium" is only a name for the richest themes: they are free, nothing is locked.

**Kłębek**: the texture is `--paper-texture` (a 12×14 px stockinette "V" tile, 1.2:1 against the
paper, felt rather than seen). It sits on the page background only, never under grid cells: the
canvas paints its own sheet. The kitten is a calm line drawing coloured by `--fur`, `--ink` and
`--marker` (no big eyes, no hearts). It replaces the stitch logo in the header and peeks over the
chart in the theme tile. Planned, not built yet: the kitten peeking over the grid edge, a yarn ball
marking the current row next to the keeper, and its small reactions on "Row done" (static with
`prefers-reduced-motion`).

## Layouts

```
Phone (portrait)                 Tablet                          Desktop
┌──────────────────────┐         ┌──────────────────┬──────┐     ┌───────────────────────┬─────────┐
│ ‹  Title    stage  ⋯ │         │ ‹ Title   stage ⋯│      │     │ ‹ Title   stage       │ Status  │
│ Row 41   St 87/262   │         │ Row 41  St 87    │ (panel│     │                       │ Row text│
├──────────────────────┤         ├──────────────────┤ slides│     │        GRID           │ Legend  │
│                      │         │                  │ over) │     │                       │ View    │
│        GRID          │         │      GRID        │      │     │                       │ controls│
│   ▬▬▬ keeper ▬▬▬     │         │                  │      │     │                       │         │
├──────────────────────┤         ├──────────────────┤      │     ├───────────────────────┤         │
│ ↶  ↷  ⌫   [Row done] │         │ ↶ ↷ ⌫  [Row done]│      │     │ ↶ ↷ ⌫ [Row done]      │         │
└──────────────────────┘         └──────────────────┴──────┘     └───────────────────────┴─────────┘
```

- **Phone**: the grid fills the width. The action bar sits at the bottom, in the thumb zone, above
  the safe-area inset. "Row done" is the largest target. Legend and row text open as a bottom sheet.
- **Tablet**: same, plus a panel that slides in from the right (legend, row text, view controls).
- **Desktop**: a fixed side panel and keyboard shortcuts shown in tooltips.
- Text is left-aligned. Numbers are right-aligned in their columns.

## Interaction rules

- Tap a stitch to mark it and everything before it. A drag pans and never marks. Pinch, ctrl+wheel,
  `+`/`-` and the slider zoom.
- The eraser is a toggle that is clearly "on" (danger colour, pressed state, label change), so it is
  never left on by accident.
- Undo and redo are always visible. A mis-tap is one tap away from being fixed.
- After each change the keeper animates to its new row (unless reduced motion is set), and the status
  line updates. A polite live region announces the new position.

## Accessibility notes

- Contrast (measured): body and muted text are ≥ 5:1 on `--paper`, `--sheet` and `--zone` in
  both themes. Zone borders (`--rule-strong`) are ≥ 5.7:1. The hatch is ≥ 3.8:1 against `--done`.
  Thin cell rules are graph-paper light (≈ 2:1) on purpose: cells are also delimited by the
  symbols and the zone borders, and the rules must not compete with the symbols.
- The saffron marker alone is only 2.4:1 on the light sheet, so it is always drawn with a 1-px
  `--ink` outline, which carries the contrast. In the dark theme it is 8.4:1.
- Progress is never colour-only: hatch + tint for done cells, a ring + tab for the marker, and a solid
  bar + arrow for the keeper.
- The canvas is focusable (`role="application"`) with a keyboard cursor, and the current row is also
  available as text (DR-12).
