import type { Chart, Yarn } from '../schema/pattern';

/**
 * Colourwork: each chart cell may have a yarn of its own, kept apart from the stitch (a stranded
 * pattern is all knit, only the yarn changes). A chart's `colors` rows hold one character per
 * cell: a yarn's letter (`A`…`L`) or `-` for none — in a chart with colours that is the main
 * yarn, A (the background).
 */

/** A cell without a colour of its own. */
export const NO_COLOR = '-';

const YARN = /^[A-L]$/;

/** Colour grid of a chart, `height` × `width`, row 1 first; null where a cell has none. */
export function chartColorRows(
  chart: Pick<Chart, 'width' | 'height' | 'colors'>,
): (string | null)[][] {
  return Array.from({ length: chart.height }, (_, r) => {
    const row = chart.colors?.[r] ?? '';
    return Array.from({ length: chart.width }, (_, c) => {
      const ch = row[c];
      return ch !== undefined && YARN.test(ch) ? ch : null;
    });
  });
}

/** The chart with these colours (rows like the chart's); no colour at all removes the layer. */
export function withColorRows(chart: Chart, rows: readonly (readonly (string | null)[])[]): Chart {
  const { colors: _old, ...plain } = chart;
  if (!rows.some((r) => r.some((y) => y !== null))) return plain;
  return {
    ...plain,
    colors: Array.from({ length: chart.height }, (_, r) =>
      Array.from({ length: chart.width }, (_, c) => {
        const y = rows[r]?.[c];
        return y && YARN.test(y) ? y : NO_COLOR;
      }).join(''),
    ),
  };
}

/** Does a chart colour any cell? */
export const hasColors = (chart: Pick<Chart, 'colors'>): boolean =>
  (chart.colors ?? []).some((row) => /[A-L]/.test(row));

/** Suggested colours for new yarns: light main colour, then contrasts that read well together. */
export const YARN_COLORS: readonly string[] = [
  '#f2ead8',
  '#2b3a55',
  '#b5452f',
  '#d9a441',
  '#4f7a4a',
  '#8a5a8c',
  '#5b8fb9',
  '#3b2a22',
  '#e3a1a8',
  '#7a7f87',
  '#a7c4a0',
  '#1e1e1e',
];

const LETTERS = 'ABCDEFGHIJKL';

/** A new yarn for a project: the first free letter, a colour not used yet. */
export function nextYarn(yarns: readonly Yarn[], name: (letter: string) => string): Yarn | null {
  const id = [...LETTERS].find((l) => !yarns.some((y) => y.id === l));
  if (!id) return null;
  const color =
    YARN_COLORS.find((c) => !yarns.some((y) => y.color.toLowerCase() === c)) ?? '#808080';
  return { id, name: name(id), color };
}

/** Relative luminance of a #rrggbb colour (0 dark … 1 light). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 1;
  const lin = (v: string) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1] ?? '0') + 0.7152 * lin(m[2] ?? '0') + 0.0722 * lin(m[3] ?? '0');
}

/** Is a yarn colour dark enough to need light symbols on it? */
export const isDark = (hex: string): boolean => luminance(hex) < 0.22;
