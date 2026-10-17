import type { Pattern } from '@kt/core';

/**
 * Onboarding sample (FR-20): a small sweater-style round with ropes and a travelling stitch.
 * Designed for this app (not taken from any published pattern), so it may ship in the build.
 */
export const SAMPLE_PATTERN_ID = 'sample-ropes-and-path';

export const samplePattern: Pattern = {
  id: SAMPLE_PATTERN_ID,
  revision: 1,
  title: 'Przykład: warkocze i ścieżka',
  designer: 'KnittingTracker',
  notes:
    'Ćwiczebny wzór na okrągło: ryż, dwa warkocze 2/2 i wędrujące oczko prawe. Służy do wypróbowania aplikacji.',
  sizes: ['jeden rozmiar'],
  symbols: [],
  legend: [
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
  ],
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
  stages: [
    {
      id: 'body',
      name: 'Korpus',
      construction: 'round',
      firstRowSide: 'RS',
      rows: 24,
      expectedStitches: 46,
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
    },
  ],
};
