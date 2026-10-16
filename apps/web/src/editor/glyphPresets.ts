import type { Glyph, GlyphPrimitive } from '@kt/core';

export const GLYPH_SHAPES = [
  'text',
  'dot',
  'circle',
  'slash',
  'backslash',
  'cross',
  'vee',
  'triangle',
] as const;
export type GlyphShape = (typeof GLYPH_SHAPES)[number];

/** Build a glyph for a custom symbol from a preset shape (custom symbols never carry raw SVG). */
export function presetGlyph(shape: GlyphShape, width: number, text: string): Glyph {
  const w = width;
  const m = 0.22;
  const p: GlyphPrimitive[] = [];
  switch (shape) {
    case 'text':
      p.push({
        kind: 'text',
        at: [w / 2, 0.52],
        text: text.slice(0, 4) || '?',
        size: text.length > 2 ? 0.42 : 0.55,
      });
      break;
    case 'dot':
      p.push({ kind: 'circle', center: [w / 2, 0.5], radius: 0.14, fill: 'ink' });
      break;
    case 'circle':
      p.push({ kind: 'circle', center: [w / 2, 0.5], radius: 0.3, fill: 'none' });
      break;
    case 'slash':
      p.push({ kind: 'line', from: [m, 1 - m], to: [w - m, m] });
      break;
    case 'backslash':
      p.push({ kind: 'line', from: [m, m], to: [w - m, 1 - m] });
      break;
    case 'cross':
      p.push(
        { kind: 'line', from: [m, 1 - m], to: [w - m, m] },
        { kind: 'line', from: [m, m], to: [w - m, 1 - m] },
      );
      break;
    case 'vee':
      p.push({
        kind: 'polyline',
        points: [
          [m + 0.05, m],
          [w / 2, 1 - m],
          [w - m - 0.05, m],
        ],
      });
      break;
    case 'triangle':
      p.push({
        kind: 'polygon',
        points: [
          [w / 2, m],
          [w - m, 1 - m],
          [m, 1 - m],
        ],
        fill: 'ink',
      });
      break;
  }
  return { primitives: p };
}
