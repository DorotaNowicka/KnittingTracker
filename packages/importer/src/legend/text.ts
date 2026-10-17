import type { SymbolRegistry } from '@kt/core';

/**
 * Read the meaning of a legend line written in Polish (the usual structure of Polish pattern
 * legends: which stitches go on the cable needle, in front or behind, what is worked next and how
 * the held stitches are worked). Returns built-in symbol ids it is sure about; anything else is left
 * to icon matching and to the user. Real-world wording is covered by the local acceptance test.
 */
export interface LegendMeaning {
  readonly symbolId: string;
  /** How the text was understood (shown in the verification screen). */
  readonly reason: 'knit' | 'purl' | 'cable' | 'yarn-over' | 'decrease' | 'no-stitch';
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s=:–-]+/, '')
    .trim();

const NUM: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, jedno: 1, dwa: 2, trzy: 3 };

/** Knit (k) or purl (p) from Polish wording; undefined when unclear. */
function kind(word: string | undefined): 'k' | 'p' | undefined {
  if (!word) return undefined;
  if (/^praw|na prawo/.test(word)) return 'k';
  if (/^lew|na lewo/.test(word)) return 'p';
  return undefined;
}

/**
 * Cable naming of the built-in library: `cable:<over>-<under>-<r|l>[p]c`. Stitches held at the back
 * make a right cross, held in front a left cross; the stitches that end up on top are the "over"
 * group, and a purl "under" group makes it a purl cross.
 */
export function cableId(spec: {
  held: number;
  heldAt: 'front' | 'back';
  worked: number;
  workedKind: 'k' | 'p';
  fromCnKind: 'k' | 'p';
}): string {
  const right = spec.heldAt === 'back';
  const over = right ? spec.worked : spec.held;
  const under = right ? spec.held : spec.worked;
  const underKind = right ? spec.fromCnKind : spec.workedKind;
  return `cable:${over}-${under}-${right ? 'r' : 'l'}${underKind === 'p' ? 'p' : ''}c`;
}

export function readLegendText(text: string, registry: SymbolRegistry): LegendMeaning | null {
  const t = norm(text);
  if (!t) return null;
  const cable =
    /zdj[aą][cć] (\d|jedno|dwa|trzy) ocz\w* na (?:drut )?(?:do warkoczy|pomocniczy)[^,]*?z (ty[lł]u|przodu)[^,]*, przerobi[cć] (\d|jedno|dwa|trzy) ocz\w* (prawe|lewe|na prawo|na lewo)[^,]*, (?:(\d|jedno|dwa|trzy) )?ocz\w* z drutu[^,]*?przerobi[cć] na (prawo|lewo)/.exec(
      t,
    );
  if (cable) {
    const held = NUM[cable[1] ?? ''] ?? 0;
    const worked = NUM[cable[3] ?? ''] ?? 0;
    const workedKind = kind(cable[4]);
    const fromCnKind = kind(cable[6]);
    if (held && worked && workedKind && fromCnKind) {
      const id = cableId({
        held,
        heldAt: cable[2]?.startsWith('ty') ? 'back' : 'front',
        worked,
        workedKind,
        fromCnKind,
      });
      if (registry.has(id)) return { symbolId: id, reason: 'cable' };
    }
    return null;
  }
  if (/^(1 )?oczko prawe na prawej stronie/.test(t) || /^oczko prawe$/.test(t)) {
    return { symbolId: 'std:k', reason: 'knit' };
  }
  if (/^(1 )?oczko lewe na prawej stronie/.test(t) || /^oczko lewe$/.test(t)) {
    return { symbolId: 'std:p', reason: 'purl' };
  }
  if (/^narzut\b/.test(t)) return { symbolId: 'std:yo', reason: 'yarn-over' };
  if (/^(przerobi[cć] )?2 oczka razem na prawo\b/.test(t))
    return { symbolId: 'std:k2tog', reason: 'decrease' };
  if (/^(przerobi[cć] )?2 oczka razem na lewo\b/.test(t))
    return { symbolId: 'std:p2tog', reason: 'decrease' };
  if (/^brak oczka|^nie ma oczka/.test(t)) return { symbolId: 'std:none', reason: 'no-stitch' };
  return null;
}
