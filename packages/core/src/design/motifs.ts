import { z } from 'zod';
import { applySymbolRows, blankChart } from '../chart/edit';
import type { LocalizedText } from '../basics';
import { chartSchema, CONTINUATION, type Chart } from '../schema/pattern';
import { STD } from '../symbols/library';

/** A ready-made piece of pattern for the creator's library. */
export interface Motif {
  readonly chart: Chart;
  readonly label: LocalizedText;
}

const K = STD.knit;
const P = STD.purl;
const C = CONTINUATION;

/** Rows are given top row first, as drawn on paper; charts store row 1 (bottom) first. */
const motif = (id: string, pl: string, en: string, drawn: string[][]): Motif => ({
  label: { pl, en },
  chart: applySymbolRows(
    blankChart({ id: `lib:${id}`, name: pl.slice(0, 40) }, 1, 1),
    [...drawn].reverse(),
  ),
});

/** Built-in pieces, simplest first. Ids start with `lib:`; the knitter's own start with `own:`. */
export const MOTIF_LIBRARY: readonly Motif[] = [
  motif('rib-1-1', 'Ściągacz 1/1', 'Rib 1×1', [[K, P]]),
  motif('rib-2-2', 'Ściągacz 2/2', 'Rib 2×2', [[K, K, P, P]]),
  motif('purl', 'Lewe oczka', 'Reverse stockinette', [[P]]),
  motif('garter', 'Ścieg francuski (okrążenia)', 'Garter (in the round)', [[P], [K]]),
  motif('moss', 'Ryż', 'Seed stitch', [
    [P, K],
    [K, P],
  ]),
  motif('double-moss', 'Ryż podwójny', 'Double seed stitch', [
    [P, K],
    [P, K],
    [K, P],
    [K, P],
  ]),
  motif('cable-2-2-left', 'Warkocz 2/2 w lewo', 'Cable 2/2 left', [
    [P, K, K, K, K, P],
    [P, 'cable:2-2-lc', C, C, C, P],
    [P, K, K, K, K, P],
    [P, K, K, K, K, P],
  ]),
  motif('cable-2-2-right', 'Warkocz 2/2 w prawo', 'Cable 2/2 right', [
    [P, K, K, K, K, P],
    [P, 'cable:2-2-rc', C, C, C, P],
    [P, K, K, K, K, P],
    [P, K, K, K, K, P],
  ]),
  motif('eyelets', 'Dziurki', 'Eyelets', [
    [K, K],
    [STD.k2tog, STD.yarnOver],
  ]),
];

/** Stored pieces of pattern, validated; anything that isn't a list of charts reads as none. */
export function parseMotifs(raw: unknown): Chart[] {
  const parsed = z.array(chartSchema).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}
