import type { ProjectKind } from '@kt/core';

/**
 * What a pattern text says about the parts' lengths ("przerabiać do wys. 34-36-38 cm") and whether
 * the body is made as separate pieces (headings "TYŁ", "PRZÓD"). Sections start at a part's
 * heading (a short line, a line in capitals or "Name:") and run to the next heading.
 */

const L = '\\p{L}*';
const word = (alternatives: string) =>
  new RegExp(`^(?:(?:wykonani|robieni)${L}\\s+|the\\s+)?(?:${alternatives})(?!\\p{L})`, 'iu');

/** Headings per part id, specific names first; body pieces before the body as a whole. */
const HEADINGS: readonly (readonly [string, RegExp])[] = [
  ['left-front', word(`lew${L} prz(?:ó|o)d${L}|left fronts?`)],
  ['right-front', word(`praw${L} prz(?:ó|o)d${L}|right fronts?`)],
  ['back', word(`ty(?:ł|l)${L}|back`)],
  ['front', word(`prz(?:ó|o)d${L}|fronts?`)],
  [
    'sleeve-cuff',
    word(`(?:ściągacz|sciagacz)${L} (?:rękaw|rekaw)${L}|mankiet${L}|sleeve cuffs?|cuffs?`),
  ],
  ['neck', word(`(?:ściągacz|sciagacz)${L} dekolt${L}|dekolt${L}|golf${L}|kołnierz${L}|neck${L}`)],
  ['bottom-rib', word(`(?:dolny )?(?:ściągacz|sciagacz)${L}|ribbing|hem`)],
  ['yoke', word(`karcz${L}|raglan${L}|yoke`)],
  ['sleeve', word(`rękaw${L}|rekaw${L}|sleeves?`)],
  ['body', word(`korpus${L}|tułów${L}|tulow${L}|body`)],
  ['leg', word(`cholew${L}|legs?`)],
  ['foot', word(`stop[aęyie](?!\\p{L})|stopy|foot`)],
  ['crown', word(`denk${L}|crown`)],
  ['brim', word(`brzeg${L}|wywini${L}|brim`)],
  ['main', word(`(?:część|czesc) główna|wzór główny|main`)],
];

const NUMBERING = /^\s*(?:(?:krok|część|czesc|etap|step|part)\s*\d+\s*[:.–-]?\s*|\d+[.)]\s*)/iu;

/** The part whose heading starts this line, or null. */
function headingOf(line: string): string | null {
  const rest = line.replace(NUMBERING, '').trim();
  if (!rest) return null;
  const upper = rest === rest.toUpperCase() && /\p{Lu}/u.test(rest);
  for (const [id, re] of HEADINGS) {
    const m = re.exec(rest);
    if (!m) continue;
    const colon = /^\s*[:–-]/.test(rest.slice(m[0].length));
    return rest.length <= 32 || upper || colon ? id : null;
  }
  return null;
}

/** The text split at part headings: each part's own lines, the first section of each part. */
function sections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  let lines: string[] = [];
  const close = () => {
    if (current && !out.has(current)) out.set(current, lines.join('\n'));
  };
  for (const line of text.split('\n')) {
    const id = headingOf(line);
    if (id) {
      close();
      current = id;
      lines = [line];
    } else if (current) {
      lines.push(line);
    }
  }
  close();
  return out;
}

/** True when the text has headings for both a back and a front: the body is made in pieces. */
export function detectBodyPieces(text: string): { pieces: boolean; evidence: string[] } {
  const found = sections(text);
  const back = found.has('back');
  const front = found.has('front') || found.has('left-front') || found.has('right-front');
  if (!back || !front) return { pieces: false, evidence: [] };
  const first = (s: string | undefined) => (s ?? '').split('\n')[0]?.trim() ?? '';
  return {
    pieces: true,
    evidence: [
      first(found.get('back')),
      first(found.get('front') ?? found.get('left-front') ?? found.get('right-front')),
    ],
  };
}

export interface PartLength {
  /** Centimetres per size (one value for every size when the text gives one). */
  readonly cm: readonly number[];
  /** The words it was read from, e.g. "do wys. 34-36-38 cm". */
  readonly evidence: string;
}

const NUM = String.raw`\d{1,3}(?:[.,]\d)?`;
const CM_RE = new RegExp(String.raw`(${NUM}(?:\s*[-–/]\s*${NUM}){0,9})\s*cm(?!\p{L})`, 'gu');
/** Words that announce a length to knit, close before the number. */
const LENGTH_WORD =
  /(?:wys\p{L}*|długoś\p{L}*|dlugos\p{L}*|do\s|aż|az\s|ok\.|około|until|measures?|length|przerabia\p{L}*)/iu;

/** The words around a found length: from the start of its sentence (at most ~60 characters back). */
function evidenceOf(section: string, index: number, length: number): string {
  const from = Math.max(0, index - 60);
  const window = section.slice(from, index);
  // A sentence ends at ". " before a capital letter ("do wys. 34 cm" is an abbreviation).
  const ends = [...window.matchAll(/[.!?]\s+(?=\p{Lu})|\n/gu)].map((m) => m.index + m[0].length);
  const stop = ends.length > 0 ? (ends.at(-1) ?? 0) - 1 : -1;
  let start = stop >= 0 ? from + stop + 1 : from;
  // Don't start in the middle of a word.
  if (stop < 0 && from > 0) start = from + Math.max(0, window.search(/\s/u) + 1);
  return section
    .slice(start, index + length)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The length each part is knitted to, read from its section. A list of numbers must have one
 * value per size (or one for all); measurements of a swatch ("= 10 cm", "10 x 10 cm") are skipped.
 */
export function partLengths(text: string, sizeCount: number): Record<string, PartLength> {
  const out: Record<string, PartLength> = {};
  for (const [id, section] of sections(text)) {
    let best: { m: RegExpExecArray; score: number } | null = null;
    for (const m of section.matchAll(CM_RE)) {
      const values = (m[1] ?? '').split(/\s*[-–/]\s*/).map((v) => Number(v.replace(',', '.')));
      if (values.length !== sizeCount && values.length !== 1) continue;
      if (values.some((v) => !Number.isFinite(v) || v <= 0 || v > 300)) continue;
      const before = section.slice(Math.max(0, m.index - 40), m.index);
      const after = section.slice(m.index + m[0].length, m.index + m[0].length + 4);
      // A swatch, not a length: "= 10 cm", "10 x 10 cm", "na 10 cm".
      if (/[=x×]\s*$/iu.test(before) || /^\s*[x×]/u.test(after) || /\bna\s*$/iu.test(before)) {
        continue;
      }
      const score = LENGTH_WORD.test(before) ? 2 : 1;
      if (!best || score > best.score) best = { m, score };
    }
    if (!best) continue;
    const values = (best.m[1] ?? '').split(/\s*[-–/]\s*/).map((v) => Number(v.replace(',', '.')));
    out[id] = { cm: values, evidence: evidenceOf(section, best.m.index, best.m[0].length) };
  }
  return out;
}

/** The length of `partId` at size `sizeIndex`: its own section, or the body's for a body piece. */
export function lengthOf(
  lengths: Record<string, PartLength>,
  partId: string,
  sizeIndex: number,
): { cm: number; evidence: string } | null {
  const pieces = ['back', 'front', 'left-front', 'right-front'];
  const found = lengths[partId] ?? (pieces.includes(partId) ? lengths['body'] : undefined);
  if (!found) return null;
  const cm = found.cm.length === 1 ? found.cm[0] : found.cm[sizeIndex];
  return cm === undefined ? null : { cm, evidence: found.evidence };
}

/** Kinds whose body can be made in pieces (a choice "in the round / in pieces"). */
export const PIECED_BODY: readonly ProjectKind[] = ['sweater', 'cardigan', 'vest'];
