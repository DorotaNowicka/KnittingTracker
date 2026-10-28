import { PROJECT_KIND_INFO, type ProjectKind } from '@kt/core';
import { HEADINGS, NUMBERING, word, type Headings } from './order';

/**
 * The pattern text cut at its headings, so the knitter can see which part each piece of the
 * description went to — and spot what went nowhere. A heading is a short line, a line in capitals
 * or "Name:" (as in `detectPartOrder`). Each block runs to the next heading:
 *
 * - `part`: under a heading of one of the garment's parts ("RĘKAWY", "Tył:");
 * - `general`: under a heading that is about the whole pattern (materials, gauge, sizes, finishing);
 * - `unknown`: under a heading that is neither — the knitter should look at it;
 * - `intro`: the text before the first heading.
 *
 * A kind with one part only (a scarf, an own project) gets every block that is not general.
 */
export interface DescriptionBlock {
  readonly type: 'intro' | 'part' | 'general' | 'unknown';
  /** The part's id (an item id of the kind, or a body piece such as `back`); null otherwise. */
  readonly partId: string | null;
  /** The heading line as written; '' for the intro. */
  readonly heading: string;
  /** The lines under the heading (without it), trimmed; may be empty. */
  readonly text: string;
}

const L = '\\p{L}*';

/** Body pieces, for the kinds whose body can be made in pieces (see `PIECED_BODY`). */
const PIECES: Headings = [
  ['left-front', word(`lew${L} prz(?:ó|o)d${L}|left fronts?`)],
  ['right-front', word(`praw${L} prz(?:ó|o)d${L}|right fronts?`)],
  ['back', word(`ty(?:ł|l)${L}|back`)],
  ['front', word(`prz(?:ó|o)d${L}|fronts?`)],
];

/** Sections about the whole pattern rather than a part. */
const GENERAL = word(
  [
    `materia${L}`,
    `włóczk${L}`,
    `wloczk${L}`,
    `drut${L}`,
    `próbk${L}`,
    `probk${L}`,
    `rozmiar${L}`,
    `wymiar${L}`,
    `skrót${L}`,
    `skrot${L}`,
    `oznacz${L}`,
    `legend${L}`,
    `schemat${L}`,
    `wykończeni${L}`,
    `wykonczeni${L}`,
    `uwag${L}`,
    `informacj${L}`,
    `potrzebn${L}`,
    `porad${L}`,
    `wskazówk${L}`,
    `wskazowk${L}`,
    `wykorzystywan${L}`,
    `technik${L}`,
    `ścieg${L}`,
    `scieg${L}`,
    `dodawani${L}`,
    `zamykani${L}`,
    `podwyższeni${L}`,
    `podwyzszeni${L}`,
    `robótk${L}`,
    `robotk${L}`,
    `stitches`,
    `techniques?`,
    `pattern`,
    `materials?`,
    `yarns?`,
    `needles?`,
    `gauge`,
    `tension`,
    `sizes?`,
    `measurements?`,
    `abbreviations?`,
    `charts?`,
    `finishing`,
    `notes?`,
    `tips?`,
  ].join('|'),
);

const PIECED: readonly ProjectKind[] = ['sweater', 'cardigan', 'vest'];

/** Is this line a heading (any heading, known or not)? */
function looksLikeHeading(rest: string): boolean {
  const letters = rest.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  // A pattern number ("DROPS 219-15") or a list of sizes ("S – M – L – XL") is not a heading.
  if ((rest.match(/\d/g) ?? []).length > 1) return false;
  if (
    /^(?:[2-5]?X{0,3}[SML]|XX?L|\d{1,3})(?:\s*[-–/]\s*(?:[2-5]?X{0,3}[SML]|XX?L|\d{1,3}))+$/u.test(
      rest,
    )
  )
    return false;
  const upper = rest === rest.toUpperCase() && /\p{Lu}/u.test(rest);
  if (upper && rest.length <= 40 && letters.length >= 4) return true;
  return rest.length <= 32 && /:\s*$/u.test(rest);
}

/** What heading this line is, if it is one. */
function headingOf(
  line: string,
  headings: Headings,
): { type: 'part' | 'general' | 'unknown'; partId: string | null } | null {
  const rest = line.replace(NUMBERING, '').trim();
  if (!rest) return null;
  const upper = rest === rest.toUpperCase() && /\p{Lu}/u.test(rest);
  const short = (m: RegExpExecArray) =>
    rest.length <= 32 || upper || /^\s*[:–-]/.test(rest.slice(m[0].length));
  for (const [id, re] of headings) {
    const m = re.exec(rest);
    if (m && short(m)) return { type: 'part', partId: id };
  }
  const g = GENERAL.exec(rest);
  if (g && short(g)) return { type: 'general', partId: null };
  // "SWETER – SKRÓCONY OPIS ROBÓTKI", "ROBÓTKĘ ROZPOCZYNAMY TUTAJ": about the whole pattern.
  if (
    looksLikeHeading(rest) &&
    /skrócon|skrocon|opis robótki|rozpoczyna|overview|begin here/iu.test(rest)
  )
    return { type: 'general', partId: null };
  return looksLikeHeading(rest) ? { type: 'unknown', partId: null } : null;
}

export function descriptionBlocks(text: string, kind: ProjectKind): DescriptionBlock[] {
  const known = HEADINGS[kind] ?? [];
  // Body pieces first: "Lewy przód" before "przód", and before the body as a whole.
  const headings = PIECED.includes(kind) ? [...PIECES, ...known] : known;
  // One part only: everything that is not general belongs to it.
  const single =
    known.length === 0 ? (kind === 'custom' ? 'main' : PROJECT_KIND_INFO[kind].main) : null;

  const blocks: DescriptionBlock[] = [];
  let current: Omit<DescriptionBlock, 'text'> = { type: 'intro', partId: null, heading: '' };
  let lines: string[] = [];
  const close = () => {
    const body = lines.join('\n').trim();
    if (current.type !== 'intro' || body) {
      blocks.push(
        single && current.type !== 'general'
          ? { ...current, type: 'part', partId: single, text: body }
          : { ...current, text: body },
      );
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const h = headingOf(line, headings);
    if (h) {
      close();
      current = { ...h, heading: line.trim() };
      lines = [];
    } else {
      lines.push(line);
    }
  }
  close();
  return blocks;
}
