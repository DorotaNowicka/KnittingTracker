import { cable } from './cable';
import type { Glyph, GlyphPoint, SymbolDef } from './types';

/**
 * Built-in symbol library (FR-6). Descriptions are written in our own words. Catalogue numbers
 * (`numbers.drops`) are metadata used to suggest matches during import, never identity (DR-10).
 *
 * Glyph conventions follow common chart practice; the cable glyphs mirror the DROPS drawing style
 * because that is the main source of patterns for this app.
 */

const g = (...primitives: Glyph['primitives']): Glyph => ({ primitives });
const line = (from: GlyphPoint, to: GlyphPoint) => ({ kind: 'line', from, to }) as const;
const polyline = (...points: GlyphPoint[]) => ({ kind: 'polyline', points }) as const;
const filled = (...points: GlyphPoint[]) => ({ kind: 'polygon', points, fill: 'ink' }) as const;

export const STD = {
  knit: 'std:k',
  purl: 'std:p',
  noStitch: 'std:none',
  yarnOver: 'std:yo',
  k2tog: 'std:k2tog',
  ssk: 'std:ssk',
  p2tog: 'std:p2tog',
  ssp: 'std:ssp',
  bindOff: 'std:bo',
  m1l: 'std:m1l',
  m1r: 'std:m1r',
} as const;

const basic: SymbolDef[] = [
  {
    id: STD.knit,
    numbers: { drops: '1' },
    family: 'basic',
    width: 1,
    consumes: 1,
    produces: 1,
    worked: true,
    flow: { in: ['k'], out: ['k'] },
    ws: { mode: 'invert', symbolId: STD.purl },
    glyph: g(),
    label: { pl: 'prawe', en: 'k' },
    description: {
      pl: 'Oczko prawe na prawej stronie robótki, lewe na lewej stronie.',
      en: 'Knit on the right side, purl on the wrong side.',
    },
  },
  {
    id: STD.purl,
    numbers: { drops: '21' },
    family: 'basic',
    width: 1,
    consumes: 1,
    produces: 1,
    worked: true,
    flow: { in: ['p'], out: ['p'] },
    ws: { mode: 'invert', symbolId: STD.knit },
    glyph: g(line([0.28, 0.5], [0.72, 0.5])),
    label: { pl: 'lewe', en: 'p' },
    description: {
      pl: 'Oczko lewe na prawej stronie robótki, prawe na lewej stronie.',
      en: 'Purl on the right side, knit on the wrong side.',
    },
  },
  {
    id: STD.noStitch,
    family: 'no-stitch',
    width: 1,
    consumes: 0,
    produces: 0,
    worked: false,
    ws: { mode: 'same' },
    glyph: g({
      kind: 'polygon',
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      fill: 'muted',
    }),
    label: { pl: 'brak oczka', en: 'no stitch' },
    description: {
      pl: 'Brak oczka – kratkę pomiń, służy tylko do wyrównania schematu.',
      en: 'No stitch – skip this cell; it only keeps the chart aligned.',
    },
  },
  {
    id: STD.yarnOver,
    family: 'increase',
    width: 1,
    consumes: 0,
    produces: 1,
    worked: true,
    ws: { mode: 'same' },
    glyph: g({ kind: 'circle', center: [0.5, 0.5], radius: 0.28, fill: 'none' }),
    label: { pl: 'narzut', en: 'yo' },
    description: { pl: 'Narzut.', en: 'Yarn over.' },
  },
  {
    id: STD.m1l,
    family: 'increase',
    width: 1,
    consumes: 0,
    produces: 1,
    worked: true,
    ws: {
      mode: 'explicit',
      text: { pl: 'Dodaj 1 oczko lewe (pochylone w lewo).', en: 'M1L purlwise.' },
    },
    glyph: g(polyline([0.25, 0.8], [0.5, 0.2], [0.75, 0.8]), line([0.25, 0.8], [0.5, 0.8])),
    label: { pl: 'dodaj L', en: 'M1L' },
    description: {
      pl: 'Dodaj 1 oczko pochylone w lewo (z nitki między oczkami).',
      en: 'Make one left-leaning stitch from the bar between stitches.',
    },
  },
  {
    id: STD.m1r,
    family: 'increase',
    width: 1,
    consumes: 0,
    produces: 1,
    worked: true,
    ws: {
      mode: 'explicit',
      text: { pl: 'Dodaj 1 oczko lewe (pochylone w prawo).', en: 'M1R purlwise.' },
    },
    glyph: g(polyline([0.25, 0.8], [0.5, 0.2], [0.75, 0.8]), line([0.5, 0.8], [0.75, 0.8])),
    label: { pl: 'dodaj P', en: 'M1R' },
    description: {
      pl: 'Dodaj 1 oczko pochylone w prawo (z nitki między oczkami).',
      en: 'Make one right-leaning stitch from the bar between stitches.',
    },
  },
  {
    id: STD.k2tog,
    family: 'decrease',
    width: 1,
    consumes: 2,
    produces: 1,
    worked: true,
    ws: { mode: 'invert', symbolId: STD.p2tog },
    glyph: g(line([0.2, 0.85], [0.8, 0.15])),
    label: { pl: '2 razem prawe', en: 'k2tog' },
    description: {
      pl: '2 oczka razem na prawo (ubytek pochylony w prawo).',
      en: 'Knit 2 together (right-leaning decrease).',
    },
  },
  {
    id: STD.ssk,
    family: 'decrease',
    width: 1,
    consumes: 2,
    produces: 1,
    worked: true,
    ws: { mode: 'invert', symbolId: STD.ssp },
    glyph: g(line([0.2, 0.15], [0.8, 0.85])),
    label: { pl: '2 razem przekręcone', en: 'ssk' },
    description: {
      pl: '2 oczka razem na prawo przekręcone (ubytek pochylony w lewo).',
      en: 'Slip, slip, knit (left-leaning decrease).',
    },
  },
  {
    id: STD.p2tog,
    family: 'decrease',
    width: 1,
    consumes: 2,
    produces: 1,
    worked: true,
    ws: { mode: 'invert', symbolId: STD.k2tog },
    glyph: g(line([0.2, 0.85], [0.8, 0.15]), line([0.3, 0.5], [0.45, 0.5])),
    label: { pl: '2 razem lewe', en: 'p2tog' },
    description: { pl: '2 oczka razem na lewo.', en: 'Purl 2 together.' },
  },
  {
    id: STD.ssp,
    family: 'decrease',
    width: 1,
    consumes: 2,
    produces: 1,
    worked: true,
    ws: { mode: 'invert', symbolId: STD.ssk },
    glyph: g(line([0.2, 0.15], [0.8, 0.85]), line([0.55, 0.5], [0.7, 0.5])),
    label: { pl: '2 razem lewe przekręcone', en: 'ssp' },
    description: { pl: '2 oczka razem na lewo przekręcone.', en: 'Slip, slip, purl.' },
  },
  {
    id: STD.bindOff,
    family: 'bind-off',
    width: 1,
    consumes: 1,
    produces: 0,
    worked: true,
    ws: { mode: 'same' },
    glyph: g({ kind: 'circle', center: [0.5, 0.5], radius: 0.18, fill: 'ink' }),
    label: { pl: 'zamknij', en: 'BO' },
    description: { pl: 'Zamknij oczko.', en: 'Bind off this stitch.' },
  },
];

/** Cable crossings. "R" = stitches travel right (held at back), "L" = travel left (held in front). */
const cables: SymbolDef[] = [
  cable({
    id: 'cable:1-1-rc',
    numbers: { drops: '218' },
    heldAt: 'back',
    fromCableNeedle: ['k'],
    worked: ['k'],
    glyph: g(filled([0, 1], [2, 0], [2, 1])),
    label: { pl: 'krzyż 1/1 w prawo', en: '1/1 RC' },
  }),
  cable({
    id: 'cable:1-1-lc',
    heldAt: 'front',
    fromCableNeedle: ['k'],
    worked: ['k'],
    glyph: g(filled([0, 0], [0, 1], [2, 1])),
    label: { pl: 'krzyż 1/1 w lewo', en: '1/1 LC' },
  }),
  cable({
    id: 'cable:1-1-rpc',
    numbers: { drops: '202' },
    heldAt: 'back',
    fromCableNeedle: ['p'],
    worked: ['k'],
    glyph: g(line([0.06, 0.8], [1.94, 0.2])),
    label: { pl: 'krzyż 1/1 w prawo z lewym', en: '1/1 RPC' },
  }),
  cable({
    id: 'cable:1-1-lpc',
    numbers: { drops: '201' },
    heldAt: 'front',
    fromCableNeedle: ['k'],
    worked: ['p'],
    glyph: g(line([0.06, 0.2], [1.94, 0.8])),
    label: { pl: 'krzyż 1/1 w lewo z lewym', en: '1/1 LPC' },
  }),
  cable({
    id: 'cable:2-1-rc',
    heldAt: 'back',
    fromCableNeedle: ['k'],
    worked: ['k', 'k'],
    glyph: g(filled([0.08, 0.9], [2, 0.1], [2.85, 0.9])),
    label: { pl: 'krzyż 2/1 w prawo', en: '2/1 RC' },
  }),
  cable({
    id: 'cable:2-1-lc',
    heldAt: 'front',
    fromCableNeedle: ['k', 'k'],
    worked: ['k'],
    glyph: g(filled([0.15, 0.9], [1, 0.1], [2.92, 0.9])),
    label: { pl: 'krzyż 2/1 w lewo', en: '2/1 LC' },
  }),
  cable({
    id: 'cable:2-1-rpc',
    numbers: { drops: '302' },
    heldAt: 'back',
    fromCableNeedle: ['p'],
    worked: ['k', 'k'],
    glyph: g(polyline([0.08, 0.9], [2, 0.1], [2.85, 0.9])),
    label: { pl: 'krzyż 2/1 w prawo z lewym', en: '2/1 RPC' },
  }),
  cable({
    id: 'cable:2-1-lpc',
    numbers: { drops: '306' },
    heldAt: 'front',
    fromCableNeedle: ['k', 'k'],
    worked: ['p'],
    glyph: g(polyline([0.15, 0.9], [1, 0.1], [2.92, 0.9])),
    label: { pl: 'krzyż 2/1 w lewo z lewym', en: '2/1 LPC' },
  }),
  cable({
    id: 'cable:2-2-rc',
    heldAt: 'back',
    fromCableNeedle: ['k', 'k'],
    worked: ['k', 'k'],
    glyph: g(line([0.1, 0.8], [3.9, 0.35])),
    label: { pl: 'krzyż 2/2 w prawo', en: '2/2 RC' },
  }),
  cable({
    id: 'cable:2-2-lc',
    numbers: { drops: '401' },
    heldAt: 'front',
    fromCableNeedle: ['k', 'k'],
    worked: ['k', 'k'],
    glyph: g(line([0.1, 0.35], [3.9, 0.8])),
    label: { pl: 'krzyż 2/2 w lewo', en: '2/2 LC' },
  }),
  cable({
    id: 'cable:2-2-rpc',
    heldAt: 'back',
    fromCableNeedle: ['p', 'p'],
    worked: ['k', 'k'],
    glyph: g(line([0.1, 0.8], [3.9, 0.35]), line([2.4, 0.5], [2.8, 0.5])),
    label: { pl: 'krzyż 2/2 w prawo z lewymi', en: '2/2 RPC' },
  }),
  cable({
    id: 'cable:2-2-lpc',
    heldAt: 'front',
    fromCableNeedle: ['k', 'k'],
    worked: ['p', 'p'],
    glyph: g(line([0.1, 0.35], [3.9, 0.8]), line([1.2, 0.5], [1.6, 0.5])),
    label: { pl: 'krzyż 2/2 w lewo z lewymi', en: '2/2 LPC' },
  }),
];

/** All built-in symbols, in palette order. */
export const BUILTIN_SYMBOLS: readonly SymbolDef[] = [...basic, ...cables];
