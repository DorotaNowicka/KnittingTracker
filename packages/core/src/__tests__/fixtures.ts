/**
 * Synthetic, self-invented charts and patterns for core tests (never third-party material).
 */
import type { Chart, Pattern, Stage } from '../schema/pattern';

/** 2×2 seed stitch. */
export const seed: Chart = {
  id: 'seed',
  name: 'S',
  width: 2,
  height: 2,
  palette: { k: 'std:k', p: 'std:p' },
  rows: ['kp', 'pk'],
};

/** 6×6 rope: one 2/2 left cross every 6 rows, framed by purls. Flow-consistent. */
export const rope: Chart = {
  id: 'rope',
  name: 'R',
  width: 6,
  height: 6,
  palette: { k: 'std:k', p: 'std:p', C: 'cable:2-2-lc' },
  rows: ['pC...p', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp'],
};

/** 4×4 travelling stitch: a knit stitch moves right with a 1/1 RPC and back with a 1/1 LPC. */
export const zigzag: Chart = {
  id: 'zigzag',
  name: 'Z',
  width: 4,
  height: 4,
  palette: { k: 'std:k', p: 'std:p', R: 'cable:1-1-rpc', L: 'cable:1-1-lpc' },
  rows: ['kppp', 'R.pp', 'pkpp', 'L.pp'],
};

/** 4×2 decrease chart: row 1 decreases one stitch, row 2 shows a "no stitch" cell. */
export const decrease: Chart = {
  id: 'decrease',
  name: 'D',
  width: 4,
  height: 2,
  palette: { k: 'std:k', t: 'std:k2tog', x: 'std:none' },
  rows: ['tkkx', 'xkkk'],
};

/** 3×1 single knit column used as a filler. */
export const stockinette: Chart = {
  id: 'stockinette',
  name: 'St',
  width: 1,
  height: 1,
  palette: { k: 'std:k' },
  rows: ['k'],
};

/** Round stage: filler, rope, zigzag, rope, filler; markers split it into two halves. */
export const roundStage: Stage = {
  id: 'body',
  name: 'Body',
  construction: 'round',
  firstRowSide: 'RS',
  layout: [
    { kind: 'marker', id: 'start', sectionName: 'Front' },
    { kind: 'chart', placementId: 'f1', chartId: 'seed', stitches: [5, 7] },
    { kind: 'chart', placementId: 'r1', chartId: 'rope' },
    { kind: 'chart', placementId: 'z1', chartId: 'zigzag' },
    { kind: 'marker', id: 'side', sectionName: 'Back' },
    { kind: 'chart', placementId: 'r2', chartId: 'rope', rowOffset: 3 },
    { kind: 'chart', placementId: 'f2', chartId: 'seed', stitches: [5, 7] },
  ],
  rows: 12,
  expectedStitches: [26, 30],
};

/** Flat stage, starting on the wrong side. */
export const flatStage: Stage = {
  id: 'back',
  name: 'Back',
  construction: 'flat',
  firstRowSide: 'WS',
  layout: [
    { kind: 'chart', placementId: 'f', chartId: 'seed', stitches: 3 },
    { kind: 'chart', placementId: 'z', chartId: 'zigzag' },
  ],
};

export function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'test-pattern',
    revision: 1,
    title: 'Synthetic sweater',
    sizes: ['S', 'M'],
    symbols: [],
    legend: [{ symbolId: 'cable:2-2-lc', number: 'C4', text: 'Own wording for a 4-stitch cross' }],
    charts: [seed, rope, zigzag, decrease, stockinette],
    stages: [roundStage, flatStage],
    ...overrides,
  };
}
