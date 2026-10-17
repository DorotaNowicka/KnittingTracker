import type { SymbolRegistry } from '@kt/core';
import {
  imageTemplate,
  libraryTemplate,
  similarity,
  type Scored,
  type Template,
} from '../raster/classify';
import type { GrayImage } from '../raster/gray';
import type { AnalyzedPage, TextItem } from '../pdf/analyze';
import { readLegendText, type LegendMeaning } from './text';

/**
 * Legend detection (ADR-5, step 3): small images followed on the same line by "= text" are legend
 * entries. Each icon becomes a recognition template; its symbol comes from the text (when the
 * wording is understood) and from comparing the icon with the built-in glyphs.
 */
export interface LegendItem {
  readonly page: number;
  /** Icon pixels (RGBA for display, grey for matching). */
  readonly icon: {
    readonly rgba: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  };
  readonly gray: GrayImage;
  /** Width in chart cells (cells are square). */
  readonly cells: number;
  readonly text: string;
  readonly meaning: LegendMeaning | null;
  /** Built-in symbols that look like the icon, best first. */
  readonly matches: readonly Scored<string>[];
  /** Proposed symbol, or null when nothing fits (the user decides). */
  readonly symbolId: string | null;
  readonly confidence: number;
}

interface Line {
  readonly x: number;
  readonly y: number;
  readonly h: number;
  readonly text: string;
}

function lines(texts: readonly TextItem[]): Line[] {
  const items = [...texts]
    .filter((t) => t.str.trim())
    .sort((a, b) => (Math.abs(a.y - b.y) > Math.max(2, a.h * 0.4) ? a.y - b.y : a.x - b.x));
  const out: Line[] = [];
  let cur: TextItem[] = [];
  const flush = () => {
    const first = cur[0];
    if (!first) return;
    let text = '';
    let end = -Infinity;
    for (const t of cur) {
      if (text && t.x - end > t.h * 0.15 && !text.endsWith(' ') && !t.str.startsWith(' '))
        text += ' ';
      text += t.str;
      end = t.x + t.w;
    }
    out.push({
      x: first.x,
      y: first.y,
      h: Math.max(...cur.map((t) => t.h)),
      text: text.replace(/\s+/g, ' ').trim(),
    });
    cur = [];
  };
  for (const t of items) {
    const prev = cur[cur.length - 1];
    // A new line when the baseline moves, or when there is a wide horizontal gap (columns).
    if (
      prev &&
      (Math.abs(prev.y - t.y) > Math.max(2, prev.h * 0.4) || t.x - (prev.x + prev.w) > prev.h * 4)
    )
      flush();
    cur.push(t);
  }
  flush();
  return out;
}

const libraryCache = new WeakMap<SymbolRegistry, Template[]>();
function library(registry: SymbolRegistry): Template[] {
  let t = libraryCache.get(registry);
  if (!t) {
    t = registry.all().map((d) => libraryTemplate(d));
    libraryCache.set(registry, t);
  }
  return t;
}

export function findLegend(page: AnalyzedPage, registry: SymbolRegistry): LegendItem[] {
  const textLines = lines(page.texts);
  // Icons: small images about one row high and a whole number of cells wide.
  const icons = page.images
    .filter((im) => im.h > 3 && im.h <= 30 && im.w <= im.h * 8.5 && im.gray.height <= 64)
    .map((im) => ({ im, cells: Math.max(1, Math.round(im.w / im.h)) }))
    .filter(({ im, cells }) => Math.abs(im.w / im.h - cells) < 0.35)
    .sort((a, b) => a.im.y - b.im.y);
  const out: LegendItem[] = [];
  icons.forEach(({ im, cells }, i) => {
    const next = icons[i + 1]?.im.y ?? Infinity;
    const right = im.x + im.w;
    const own = textLines.filter(
      (l) =>
        l.x >= right - 2 && l.x <= right + 40 && l.y >= im.y - 2 && l.y <= im.y + im.h + l.h * 0.6,
    );
    const first = own[0];
    if (!first || !/^\s*[=:–-]/.test(first.text)) return;
    // Continuation lines: below, indented at least to the text, before the next icon.
    const more = textLines.filter(
      (l) =>
        l.y > first.y + first.h * 0.5 &&
        l.y < next - 2 &&
        l.y < first.y + first.h * 6 &&
        l.x >= right - 2 &&
        l.x <= right + 60,
    );
    const text = [first, ...more]
      .map((l) => l.text)
      .join(' ')
      .replace(/^\s*[=:–-]\s*/, '')
      .trim();
    const meaning = readLegendText(text, registry);
    const tpl = imageTemplate('icon', cells, im.gray);
    const matches = library(registry)
      .filter((t) => t.width === cells)
      .map((t) => ({ value: t.symbolId, score: similarity(tpl.vec, t.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const best = matches[0];
    let symbolId: string | null = null;
    let confidence = 0;
    if (meaning && registry.get(meaning.symbolId)?.width === cells) {
      symbolId = meaning.symbolId;
      const agrees = matches.slice(0, 2).some((m) => m.value === meaning.symbolId);
      confidence = agrees ? 0.97 : 0.8;
    } else if (best && best.score >= 0.55) {
      symbolId = best.value;
      confidence = Math.min(0.9, Math.max(0.3, best.score - (matches[1]?.score ?? 0) + 0.4));
    }
    out.push({
      page: page.index,
      icon: { rgba: im.rgba, width: im.gray.width, height: im.gray.height },
      gray: im.gray,
      cells,
      text,
      meaning,
      matches,
      symbolId,
      confidence,
    });
  });
  return out;
}
