import type { LegendEntry, Pattern, Project } from '@kt/core';

/**
 * Onboarding sample (FR-20): a small sweater-style project — a ribbed edge, then a round with
 * ropes and a travelling stitch. Designed for this app (not taken from any published pattern),
 * so it may ship in the build.
 */
export const SAMPLE_PROJECT_ID = 'sample-ropes-and-path';

const legend: LegendEntry[] = [
  { symbolId: 'std:k', text: 'oczko prawe' },
  { symbolId: 'std:p', text: 'oczko lewe' },
  {
    symbolId: 'cable:2-2-lc',
    text: 'warkocz: 2 oczka przed robótką, 2 prawe, 2 prawe z drutu pomocniczego',
  },
  {
    symbolId: 'cable:1-1-rpc',
    text: 'ścieżka w prawo: 1 oczko za robótką, 1 prawe, 1 lewe z drutu pomocniczego',
  },
  {
    symbolId: 'cable:1-1-lpc',
    text: 'ścieżka w lewo: 1 oczko przed robótką, 1 lewe, 1 prawe z drutu pomocniczego',
  },
];

/** The ribbed edge: a row counter is enough for 1×1 rib. */
const rib: Pattern = {
  id: 'rib',
  name: 'Ściągacz',
  construction: 'round',
  firstRowSide: 'RS',
  tracking: 'rows',
  rows: 8,
  charts: [
    {
      id: 'P',
      name: 'Ściągacz 1×1',
      width: 2,
      height: 1,
      palette: { k: 'std:k', p: 'std:p' },
      rows: ['pk'],
    },
  ],
  symbols: [],
  legend: legend.slice(0, 2),
  layout: [{ kind: 'chart', placementId: 'p1', chartId: 'P', stitches: 46 }],
};

/** The body: seed stitch, ropes and a travelling stitch, front and back in one round. */
const body: Pattern = {
  id: 'body',
  name: 'Korpus',
  construction: 'round',
  firstRowSide: 'RS',
  rows: 24,
  expectedStitches: 46,
  symbols: [],
  legend,
  charts: [
    {
      id: 'R',
      name: 'Ryż',
      width: 2,
      height: 2,
      palette: { k: 'std:k', p: 'std:p' },
      rows: ['kp', 'pk'],
    },
    {
      id: 'W',
      name: 'Warkocz',
      width: 6,
      height: 6,
      palette: { k: 'std:k', p: 'std:p', C: 'cable:2-2-lc' },
      rows: ['pC...p', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp'],
    },
    {
      id: 'S',
      name: 'Ścieżka',
      width: 5,
      height: 8,
      palette: { k: 'std:k', p: 'std:p', R: 'cable:1-1-rpc', L: 'cable:1-1-lpc' },
      rows: ['pkppp', 'pR.pp', 'ppkpp', 'ppR.p', 'pppkp', 'ppL.p', 'ppkpp', 'pL.pp'],
    },
  ],
  layout: [
    { kind: 'marker', id: 'start', sectionName: 'Przód' },
    { kind: 'chart', placementId: 'r1', chartId: 'R', stitches: 3 },
    { kind: 'chart', placementId: 'w1', chartId: 'W' },
    { kind: 'chart', placementId: 's1', chartId: 'S' },
    { kind: 'chart', placementId: 'w2', chartId: 'W' },
    { kind: 'chart', placementId: 'r2', chartId: 'R', stitches: 3 },
    { kind: 'marker', id: 'side', sectionName: 'Tył' },
    { kind: 'chart', placementId: 'r3', chartId: 'R', stitches: 3 },
    { kind: 'chart', placementId: 'w3', chartId: 'W', rowOffset: 3 },
    { kind: 'chart', placementId: 's2', chartId: 'S', rowOffset: 4 },
    { kind: 'chart', placementId: 'w4', chartId: 'W', rowOffset: 3 },
    { kind: 'chart', placementId: 'r4', chartId: 'R', stitches: 3 },
  ],
};

/** A fresh copy of the sample project (it opens on the body, the interesting grid). */
export function sampleProject(id: string, name: string, now: string): Project {
  return {
    id,
    name,
    revision: 1,
    designer: 'KnittingTracker',
    notes:
      'Ćwiczebny projekt na okrągło: ściągacz, a potem korpus z ryżem, dwoma warkoczami 2/2 i wędrującym oczkiem prawym. Służy do wypróbowania aplikacji.',
    sizes: ['jeden rozmiar'],
    sizeIndex: 0,
    patterns: [rib, body],
    activePatternId: body.id,
    createdAt: now,
    updatedAt: now,
  };
}
