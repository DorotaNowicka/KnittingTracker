import type { RecognizedChart } from './classify';
import type { DetectedGrid } from './grid';

/**
 * Colourwork charts printed in colour: each cell is filled with its yarn's colour. The colours of
 * a chart are grouped (cells of one yarn differ only by print noise and JPEG artefacts) and every
 * cell gets the letter of its group — matched to the legend's colours when they are filled ones.
 */

export interface FoundColor {
  /** Yarn letter, A…L. */
  readonly id: string;
  /** #rrggbb of the cells (or of the legend icon). */
  readonly hex: string;
}

type RGB = readonly [number, number, number];

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hexOf = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export const rgbOf = (hex: string): RGB => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1] ?? 'ff', 16), parseInt(m[2] ?? 'ff', 16), parseInt(m[3] ?? 'ff', 16)]
    : [255, 255, 255];
};
const saturation = (c: RGB) => Math.max(...c) - Math.min(...c);

/** Mean colour of the middle of each cell (row 1 = bottom), composited on white. */
export function cellColors(rgba: Uint8ClampedArray, width: number, grid: DetectedGrid): RGB[][] {
  const rows: RGB[][] = [];
  for (let r = grid.rows - 1; r >= 0; r--) {
    const row: RGB[] = [];
    for (let c = 0; c < grid.cols; c++) {
      const x0 = (grid.xs[c] ?? 0) + grid.pitch * 0.28;
      const x1 = (grid.xs[c + 1] ?? x0 + grid.pitch) - grid.pitch * 0.28;
      const y0 = (grid.ys[r] ?? 0) + grid.pitch * 0.28;
      const y1 = (grid.ys[r + 1] ?? y0 + grid.pitch) - grid.pitch * 0.28;
      const sum = [0, 0, 0];
      let n = 0;
      for (let y = Math.round(y0); y < y1; y++) {
        for (let x = Math.round(x0); x < x1; x++) {
          const i = (y * width + x) * 4;
          const a = (rgba[i + 3] ?? 255) / 255;
          for (let k = 0; k < 3; k++)
            sum[k] = (sum[k] ?? 0) + (rgba[i + k] ?? 255) * a + 255 * (1 - a);
          n += 1;
        }
      }
      row.push(n ? [(sum[0] ?? 0) / n, (sum[1] ?? 0) / n, (sum[2] ?? 0) / n] : [255, 255, 255]);
    }
    rows.push(row);
  }
  return rows;
}

/** Is a chart printed in colour: enough of its cells clearly coloured (not grey)? */
export function isColored(colors: readonly (readonly RGB[])[]): boolean {
  let n = 0;
  let colored = 0;
  for (const row of colors)
    for (const c of row) {
      n += 1;
      if (saturation(c) > 45) colored += 1;
    }
  return n > 0 && colored / n >= 0.08;
}

/**
 * Group the cell colours: each cell joins the nearest group closer than `tolerance`, else starts
 * one. Groups are returned biggest first with their mean colour.
 */
export function groupColors(
  colors: readonly (readonly RGB[])[],
  tolerance = 55,
): { mean: RGB; count: number }[] {
  const groups: { sum: [number, number, number]; count: number; mean: RGB }[] = [];
  for (const row of colors)
    for (const c of row) {
      let best: (typeof groups)[number] | undefined;
      let d = Infinity;
      for (const g of groups) {
        const e = dist(c, g.mean);
        if (e < d) {
          d = e;
          best = g;
        }
      }
      if (best && d <= tolerance) {
        best.sum[0] += c[0];
        best.sum[1] += c[1];
        best.sum[2] += c[2];
        best.count += 1;
        best.mean = [best.sum[0] / best.count, best.sum[1] / best.count, best.sum[2] / best.count];
      } else groups.push({ sum: [c[0], c[1], c[2]], count: 1, mean: c });
    }
  // Specks (a few cells of a stray shade, e.g. a symbol's ink) are not yarns.
  const total = groups.reduce((s, g) => s + g.count, 0);
  return groups
    .filter((g) => g.count >= Math.max(2, total * 0.01))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((g) => ({ mean: g.mean, count: g.count }));
}

const LETTERS = 'ABCDEFGHIJKL';

/**
 * Give every cell of a colour-printed chart its yarn. `known`: colours already named (the legend's
 * filled icons, or colours found in earlier charts); a group close to one of them takes its letter,
 * others get the next free letters. Returns the chart with `color` set on its cells and the
 * colours in use.
 */
export function assignFillColors(
  rgba: Uint8ClampedArray,
  width: number,
  grid: DetectedGrid,
  chart: RecognizedChart,
  known: readonly FoundColor[],
): { chart: RecognizedChart; colors: FoundColor[] } | null {
  // Cells outside a chart in steps (no stitch) are paper, not a yarn.
  const colors = cellColors(rgba, width, grid).map((row, r) =>
    row.filter((_, c) => chart.cells[r]?.[c]?.symbolId !== 'std:none'),
  );
  if (!isColored(colors)) return null;
  const groups = groupColors(colors);
  const all = cellColors(rgba, width, grid);
  if (groups.length < 2) return null;
  const palette: FoundColor[] = [...known];
  const letterOf = groups.map((g) => {
    let best: FoundColor | undefined;
    let d = Infinity;
    for (const k of palette) {
      const e = dist(g.mean, rgbOf(k.hex));
      if (e < d) {
        d = e;
        best = k;
      }
    }
    if (best && d < 70) return best.id;
    const id = [...LETTERS].find((l) => !palette.some((p) => p.id === l));
    if (!id) return null;
    palette.push({ id, hex: hexOf(g.mean) });
    return id;
  });
  const used = new Set<string>();
  const cells = chart.cells.map((row, r) =>
    row.map((cell, c) => {
      const rgb = all[r]?.[c];
      if (!rgb || cell.symbolId === 'std:none') return cell;
      let best = -1;
      let d = Infinity;
      groups.forEach((g, i) => {
        const e = dist(rgb, g.mean);
        if (e < d) {
          d = e;
          best = i;
        }
      });
      const id = letterOf[best] ?? null;
      if (!id) return cell;
      used.add(id);
      return { ...cell, color: id };
    }),
  );
  return {
    chart: { ...chart, cells },
    colors: palette.filter((p) => used.has(p.id) || known.some((k) => k.id === p.id)),
  };
}
