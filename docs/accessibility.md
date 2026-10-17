# Accessibility audit (M6, 2026-10-17)

Target: **WCAG 2.2 level AA**. The chart grids are drawn on a canvas, so they need their own
accessible paths (ADR-6, R-4). This file records what was checked, how, and what is still open.

## Automated checks (run in every e2e run)

| Check | Where | Result |
|---|---|---|
| axe-core with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` on every screen and dialog: projects (empty and full), new project, patterns, pattern page, stage editor, chart editor, project from a pattern, import (PDF and photo steps, verification), settings with restore summary, tracker with panel, position / finish / project dialogs, row counter | `e2e/a11y.spec.ts`, plus `smoke`, `tracker`, `editor`, `import`, `stages` specs | 0 violations, **light and dark theme**, phone and desktop viewports. Canvas elements are excluded (see below) |
| Reflow at 320 CSS px (1.4.10): no sideways scrolling on any page, including the chart editor and the tracker | `e2e/a11y.spec.ts` | Passes (fixed in M6: stage cards on the pattern page overflowed by 146 px) |
| Keyboard only: reach a project with Tab, open it, focus the grid, move the cursor with arrows, mark with Enter, open the position dialog with G, close with Escape, visible focus indicator | `e2e/a11y.spec.ts`, `tracker.spec.ts` (shortcuts), `import.spec.ts` (verification by keyboard) | Passes |
| Reduced motion: transitions off under `prefers-reduced-motion: reduce` | `e2e/a11y.spec.ts` | Passes |
| Single-pointer alternative to dragging (2.5.7): photo corners can be placed by tapping | `e2e/a11y.spec.ts` | Passes (added in M6) |
| Target size (2.5.8, minimum 24 × 24 px) | axe `target-size` (part of `wcag22aa`) | Passes; main actions are ≥ 44 px by design |

## Criteria reviewed by hand

| Criterion | How the app meets it |
|---|---|
| 1.1.1 Non-text content | The grid canvas has a role description, a label and a help text; its content is available as text: **current row as text** (DR-12), the status line ("Ostatnie zrobione: rząd 3, oczko 4, razem 24") and an `aria-live` announcement after each change. Symbols always come with their names (palette, legend, quick fixes) |
| 1.3.1 Info and relationships | Landmarks on every page (`main` added to the tracker and chart editor in M6), one `h1` per page (added to the chart editor), headings per section, `fieldset`/`legend` for option groups, tables with header cells |
| 1.4.1 Use of colour | Progress is hatched as well as tinted, the current row has arrows and a frame, uncertain cells in the import have a dashed outline and a count, checks show ✓/✗ with text |
| 1.4.3 / 1.4.11 Contrast | Token pairs designed for AA in both themes (`docs/design.md`); axe checks text; grid symbols use the ink colour on the paper colour in both themes |
| 1.4.4 Resize text | Layout uses rem units and wraps; tested at 320 px width, which is equivalent to 400 % zoom on a 1280 px screen |
| 2.1.1 Keyboard | Everything works by keyboard: tracker (cursor, Enter, Space, Enter for the row, Ctrl+Z, E, C, G, +/−), chart editor (cursor, painting, selection, shortcuts), import verification (arrows, Enter, 1–9, N), photo corners (arrow keys) |
| 2.1.2 No keyboard trap | Dialogs are native `<dialog>` elements and close with Escape |
| 2.4.7 Focus visible | A visible outline on all controls; the grid shows its own cursor cell |
| 2.5.1 Pointer gestures | Pinch zoom has buttons and a slider; panning has keyboard, wheel, "Bieżące" (centre on the current stitch) and fit buttons |
| 3.1.1 / 3.1.2 Language | `<html lang>` follows the chosen language (pl/en) |
| 3.3.1 / 3.3.2 Errors and labels | Every field has a visible label; invalid values are marked with `aria-invalid` and an error text linked by `aria-describedby` |
| 4.1.3 Status messages | Progress, save failures, import progress and restore results use `role="status"`/`aria-live` |

## Excluded from axe, and why

The two **canvas grids** (tracker and chart editor) are excluded from the automated scan because
axe cannot see inside a canvas. Their accessible equivalents are the row text, the status line and
the keyboard cursor described above, which are themselves scanned.

## Open items (not verified or not fully met)

- **Screen readers** were not tested by a person (VoiceOver on iPhone/Mac, TalkBack). The
  structure is in place; a real session is needed before claiming full support.
- **2.5.7 Dragging, panning the grid on touch screens**: there is no single-pointer way to pan to
  an arbitrary part of a large grid on a phone without dragging. The current stitch, fitting a
  section and zoom work with taps; free panning needs a drag (keyboard and mouse wheel are
  available on other devices). Possible fix: pan buttons or a minimap.
- **1.4.12 Text spacing** and **2.4.11 Focus not obscured** (the action bar at the bottom of the
  tracker) were reviewed by eye only.
- **WebKit** (Safari) was not available in the build environment; the iPhone viewport ran in
  Chromium. CI runs WebKit.
