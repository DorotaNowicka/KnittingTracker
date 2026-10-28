/**
 * Colourwork in a legend: "■ = antracyt", "□ = kolor Jasny Beż / Jasny Dąb". Such an entry is a
 * yarn, not a stitch — its cells are knitted (usually knit) in that colour. Entries that mark rows
 * or places rather than stitches ("← = okrążenie z dodawaniem oczek", "✱ = oczko środkowe") are
 * marks: they never stand in a chart cell.
 */

/** Pseudo symbol of a colour entry: `color:A` … `color:L`, letters in legend order. */
export const COLOR_PREFIX = 'color:';
export const isColorSymbol = (id: string | null | undefined): id is string =>
  !!id && id.startsWith(COLOR_PREFIX);
export const colorLetter = (id: string): string => id.slice(COLOR_PREFIX.length);

export type LegendKind = 'stitch' | 'color' | 'mark';

/** Colour names a pattern may use, with a shade that reads as that colour (longest name first). */
const COLOR_NAMES: readonly (readonly [string, string])[] = (
  [
    ['szaro-brązow', '#8a7b6a'],
    ['szaro-niebiesk', '#7d8fa3'],
    ['jasny beż', '#e3d3b8'],
    ['ciemny beż', '#b9a283'],
    ['jasnoszar', '#c3c5c8'],
    ['ciemnoszar', '#55585d'],
    ['jasnoniebiesk', '#9cc3e6'],
    ['ciemnoniebiesk', '#2e4a7a'],
    ['jasnozielon', '#a9cf9a'],
    ['ciemnozielon', '#2f5a3a'],
    ['butelkow', '#1f4d3a'],
    ['musztard', '#c9a227'],
    ['pomarańcz', '#d9782d'],
    ['pomarancz', '#d9782d'],
    ['antracyt', '#3b3f45'],
    ['grafit', '#47494d'],
    ['czarn', '#1e1e1e'],
    ['biał', '#f7f5ef'],
    ['bial', '#f7f5ef'],
    ['ecru', '#efe7d4'],
    ['natural', '#ede4cf'],
    ['kremow', '#f2e8cf'],
    ['krem', '#f2e8cf'],
    ['beż', '#d9c4a3'],
    ['bez', '#d9c4a3'],
    ['camel', '#b98b5a'],
    ['szar', '#8c8f94'],
    ['popiel', '#a3a5a8'],
    ['granat', '#23314f'],
    ['niebiesk', '#3d6fb6'],
    ['błękit', '#8bb8e8'],
    ['turkus', '#2a9d8f'],
    ['mięt', '#a8d5c2'],
    ['zielon', '#4f7a4a'],
    ['oliwk', '#77753a'],
    ['khaki', '#8a8455'],
    ['żółt', '#e8c547'],
    ['zolt', '#e8c547'],
    ['czerwon', '#b8322a'],
    ['bordo', '#6d1f2a'],
    ['wiśni', '#7d1f2e'],
    ['malin', '#b0304f'],
    ['róż', '#e6a1b4'],
    ['roz', '#e6a1b4'],
    ['fiolet', '#6e4b8a'],
    ['lawend', '#b7a6d6'],
    ['rdz', '#b5532f'],
    ['rud', '#b5532f'],
    ['brąz', '#6b4a33'],
    ['braz', '#6b4a33'],
    ['kora', '#5c4433'],
    ['dąb', '#b89a72'],
    ['dab', '#b89a72'],
    ['orzech', '#6f4e37'],
    ['charcoal', '#3b3f45'],
    ['black', '#1e1e1e'],
    ['white', '#f7f5ef'],
    ['cream', '#f2e8cf'],
    ['off white', '#efe7d4'],
    ['beige', '#d9c4a3'],
    ['grey', '#8c8f94'],
    ['gray', '#8c8f94'],
    ['navy', '#23314f'],
    ['blue', '#3d6fb6'],
    ['green', '#4f7a4a'],
    ['yellow', '#e8c547'],
    ['mustard', '#c9a227'],
    ['orange', '#d9782d'],
    ['red', '#b8322a'],
    ['pink', '#e6a1b4'],
    ['purple', '#6e4b8a'],
    ['brown', '#6b4a33'],
    ['rust', '#b5532f'],
  ] as const
)
  .slice()
  .sort((a, b) => b[0].length - a[0].length);

/** Words of stitch instructions: a legend line with them is about a stitch, not a colour. */
const STITCH_WORDS =
  /(ocz(k|ek)|prawe|lewe|na prawo|na lewo|narzut|razem|przerob|zdj[aą]|dodaj|zamkn|zamyk|ujm|przekr|warkocz|stitch|knit|purl|together|slip|yarn over|cable|increase|decrease|bind)/iu;

/** Lines that mark a row or a place, not a stitch. */
const MARK =
  /^(?:(?:rząd|rzad|okrążeni|okrazeni|rzędy|rzedy|row|round)\p{L}*\s+(?:z|with)\b|.*(?:oczko środkowe|oczko srodkowe|środek|srodek|znacznik|marker|centre stitch|center stitch|middle stitch))/iu;

/** The shade a colour name stands for, or null when the name is not a known colour. */
export function colorOfName(name: string): string | null {
  const t = name.toLowerCase();
  for (const [key, hex] of COLOR_NAMES) if (t.includes(key)) return hex;
  return null;
}

/** Colour names given in the yarn list of a pattern ("kolor 53, antracyt", "colour 01, off white"). */
export function materialColors(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /(?:kolor|colou?r)\s*(?:nr\.?\s*)?\d{1,4}\s*[,:-]\s*([\p{L}][\p{L} -]{1,38})/giu,
  )) {
    const name = (m[1] ?? '').trim().toLowerCase();
    if (name) out.push(name);
  }
  return out;
}

/**
 * What a legend line is: a yarn colour ("antracyt", "kolor Jasny Beż / Jasny Dąb", a colour named
 * in the yarn list), a mark of a row or a place, or a stitch. `colorName` is the colour's name
 * without the word "kolor".
 */
export function legendKind(
  text: string,
  known: readonly string[] = [],
): { kind: LegendKind; colorName?: string } {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return { kind: 'stitch' };
  if (MARK.test(t)) return { kind: 'mark' };
  const prefixed = /^(?:kolor(?:em)?|colou?r)\s+(.+)$/iu.exec(t);
  if (prefixed) return { kind: 'color', colorName: (prefixed[1] ?? '').trim() };
  const short = t.split(' ').length <= 4 && t.length <= 40;
  const lower = t.toLowerCase();
  if (
    short &&
    !STITCH_WORDS.test(t) &&
    (colorOfName(t) !== null || known.some((k) => k === lower || k.startsWith(lower)))
  ) {
    return { kind: 'color', colorName: t };
  }
  return { kind: 'stitch' };
}

/**
 * The colour of a legend icon that is filled with it (a coloured square), as #rrggbb; null for a
 * black-and-white symbol (a mark on paper) or a plain empty cell.
 */
export function iconColor(rgba: Uint8ClampedArray, width: number, height: number): string | null {
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.ceil(width * 0.75);
  const y0 = Math.floor(height * 0.25);
  const y1 = Math.ceil(height * 0.75);
  let n = 0;
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const a = (rgba[i + 3] ?? 255) / 255;
      for (let c = 0; c < 3; c++) {
        // Transparent pixels are paper.
        const v = (rgba[i + c] ?? 255) * a + 255 * (1 - a);
        sum[c] = (sum[c] ?? 0) + v;
        sq[c] = (sq[c] ?? 0) + v * v;
      }
      n += 1;
    }
  }
  if (n === 0) return null;
  const mean = sum.map((s) => s / n);
  const spread = Math.max(...sq.map((s, c) => Math.sqrt(Math.max(0, s / n - (mean[c] ?? 0) ** 2))));
  const [r = 255, g = 255, b = 255] = mean;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturated = max - min > 40;
  // A plain fill: even inside; paper white or a grey symbol mark is not a colour.
  if (spread > 28 || (!saturated && min > 225)) return null;
  if (!saturated && spread > 12) return null;
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
