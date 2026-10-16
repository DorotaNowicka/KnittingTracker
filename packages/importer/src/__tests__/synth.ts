/**
 * Synthetic chart images for recognizer tests: random charts made of built-in symbols, drawn in
 * different styles (cell size, stroke, rules, noise, perspective). Self-generated, so they may live
 * in the repository (R-5).
 */
import {
  applySymbolRows,
  blankChart,
  CONTINUATION,
  parseChart,
  type Chart,
  type SymbolRegistry,
} from '@kt/core';
import { renderCells, type DrawnSymbol } from '../raster/draw';
import { createGray, sample, type GrayImage } from '../raster/gray';
import { homography, project, type Point } from '../raster/warp';

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random chart over the given symbols (wider symbols less often, like real charts). */
export function randomChart(
  rand: () => number,
  registry: SymbolRegistry,
  symbols: readonly string[],
  width: number,
  height: number,
  id = 'synthetic',
): Chart {
  const rows: string[][] = [];
  const singles = symbols.filter((s) => (registry.get(s)?.width ?? 1) === 1);
  const wide = symbols.filter((s) => (registry.get(s)?.width ?? 1) > 1);
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    while (row.length < width) {
      const useWide = wide.length > 0 && rand() < 0.25;
      const pool = useWide ? wide : singles;
      const id = pool[Math.floor(rand() * pool.length)] ?? 'std:k';
      const w = registry.get(id)?.width ?? 1;
      if (row.length + w > width) {
        row.push(singles[0] ?? 'std:k');
        continue;
      }
      row.push(id);
      for (let k = 1; k < w; k++) row.push(CONTINUATION);
    }
    rows.push(row);
  }
  return applySymbolRows(blankChart({ id, name: id }, width, height), rows);
}

export interface Style {
  readonly cell: number;
  readonly stroke?: number;
  readonly rule?: number;
  readonly ruleGray?: number;
  readonly margin?: number;
}

/** Draw a chart as a printed grid. */
export function drawChart(chart: Chart, registry: SymbolRegistry, style: Style): GrayImage {
  const parsed = parseChart(chart, registry);
  const symbols: DrawnSymbol[] = [];
  parsed.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.part !== 0) return;
      const def = registry.require(cell.symbolId);
      symbols.push({
        row: r + 1,
        col: c + 1,
        width: def.width,
        glyph: def.glyph,
        shaded: !def.worked,
      });
    }),
  );
  return renderCells({
    cols: chart.width,
    rows: chart.height,
    cell: style.cell,
    symbols,
    margin: style.margin ?? 12,
    ...(style.stroke !== undefined ? { stroke: style.stroke } : {}),
    ...(style.rule !== undefined ? { rule: style.rule } : {}),
    ...(style.ruleGray !== undefined ? { ruleGray: style.ruleGray } : {}),
  });
}

/** Paste images onto a page of paper at the given positions. */
export function compose(
  width: number,
  height: number,
  parts: readonly { img: GrayImage; x: number; y: number }[],
): GrayImage {
  const out = createGray(width, height);
  for (const { img, x, y } of parts) {
    for (let yy = 0; yy < img.height; yy++) {
      for (let xx = 0; xx < img.width; xx++) {
        const tx = x + xx;
        const ty = y + yy;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        out.data[ty * width + tx] = Math.min(
          out.data[ty * width + tx] ?? 255,
          img.data[yy * img.width + xx] ?? 255,
        );
      }
    }
  }
  return out;
}

/** Add sensor-like noise and a light gradient (uneven lighting). */
export function degrade(img: GrayImage, rand: () => number, noise = 10, shade = 0): GrayImage {
  const out = createGray(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const g = (rand() + rand() + rand() - 1.5) * noise;
      const light = shade * (x / img.width + y / img.height) * 0.5;
      const v = (img.data[y * img.width + x] ?? 255) * (1 - light / 255) + g;
      out.data[y * img.width + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

/** Simulate a photo: warp the image so its corners land on `corners` in a `w × h` frame. */
export function photograph(
  img: GrayImage,
  corners: readonly Point[],
  w: number,
  h: number,
): GrayImage {
  const out = createGray(w, h, 235);
  const inv = homography(corners, [
    [0, 0],
    [img.width, 0],
    [img.width, img.height],
    [0, img.height],
  ]);
  if (!inv) return out;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = project(inv, x + 0.5, y + 0.5);
      if (sx < 0 || sy < 0 || sx > img.width || sy > img.height) continue;
      out.data[y * w + x] = Math.round(sample(img, sx - 0.5, sy - 0.5) * 0.92);
    }
  }
  return out;
}
