import { describe, expect, it } from 'vitest';
import themeInit from '../../public/theme-init.js?raw';
import { THEMES } from '../lib/preferences';
import tokens from './tokens.css?raw';

/** Colour tokens every theme must set (a missing one would leak from the surrounding theme). */
const REQUIRED = [
  'paper',
  'sheet',
  'ink',
  'ink-muted',
  'rule',
  'rule-strong',
  'zone',
  'indigo',
  'indigo-hover',
  'on-indigo',
  'done',
  'done-hatch',
  'marker',
  'guide',
  'guide-half',
  'no-stitch',
  'danger',
  'on-danger',
  'success',
  'success-hover',
  'on-success',
  'success-soft',
  'fur',
  'paper-texture',
  'shadow',
];

/** Contrast floors (docs/design.md, WCAG 2.2 AA): [foreground, background, minimum]. */
const FLOORS: readonly [string, string, number][] = [
  ['ink', 'sheet', 7],
  ['ink', 'paper', 7],
  ['ink', 'zone', 7],
  ['ink', 'done', 7],
  ['ink-muted', 'paper', 5],
  ['ink-muted', 'sheet', 5],
  ['ink-muted', 'zone', 5],
  ['rule-strong', 'sheet', 5],
  ['indigo', 'paper', 4.5],
  ['indigo', 'sheet', 4.5],
  ['on-indigo', 'indigo', 4.5],
  ['done-hatch', 'done', 3.75],
  ['danger', 'sheet', 4.5],
  ['on-danger', 'danger', 4.5],
  ['success', 'sheet', 4.5],
  ['on-success', 'success', 4.5],
  ['guide', 'sheet', 3],
  ['guide-half', 'sheet', 3],
];

function themeBlocks(css: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const id = /data-theme-preview='([^']+)'/.exec(selector)?.[1];
    if (!id) continue;
    const vars = new Map<string, string>();
    for (const [, name = '', value = ''] of body.matchAll(/--([\w-]+):\s*([^;]+);/g))
      vars.set(name, value.trim());
    out.set(id, vars);
  }
  return out;
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const blocks = themeBlocks(tokens);

describe('themes', () => {
  it('has one token block per theme, each setting every colour token', () => {
    expect([...blocks.keys()].sort()).toEqual(THEMES.map((t) => t.id).sort());
    for (const [id, vars] of blocks) {
      expect({ id, missing: REQUIRED.filter((k) => !vars.has(k)) }).toEqual({ id, missing: [] });
    }
  });

  it.each(THEMES.map((t) => t.id))('%s meets the contrast floors', (id) => {
    const vars = blocks.get(id);
    const low = FLOORS.filter(([fg, bg, min]) => {
      const a = vars?.get(fg) ?? '';
      const b = vars?.get(bg) ?? '';
      return !/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b) || contrast(a, b) < min;
    }).map(([fg, bg]) => `${fg}/${bg}`);
    expect(low).toEqual([]);
  });

  it('uses each theme paper as the browser chrome colour', () => {
    for (const t of THEMES) expect(blocks.get(t.id)?.get('paper')).toBe(t.chrome);
  });

  it('follows the OS in "system" mode with exactly the dark theme', () => {
    const media =
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([^{}]*)\}/.exec(
        tokens,
      );
    const system = themeBlocks(`[data-theme-preview='x'] {${media?.[1] ?? ''}}`).get('x');
    expect(system && Object.fromEntries(system)).toEqual(
      Object.fromEntries(blocks.get('dark') ?? []),
    );
  });

  it('lists the same theme ids in the pre-paint script', () => {
    const ids = /var themes = \[([^\]]*)\]/.exec(themeInit)?.[1]?.match(/[\w-]+/g);
    expect(ids).toEqual(THEMES.map((t) => t.id));
  });
});
