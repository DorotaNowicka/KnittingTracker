import type { ProjectKind } from '@kt/core';

/**
 * What kind of project a pattern describes (sweater, socks, …), guessed from its text: the
 * title-like text (typed project name, file name, the start of the document) counts most, and
 * words for typical parts ("pięta", "kciuk") add evidence. Heuristic on purpose: the knitter sees
 * the guess with the words it came from and can change it.
 */
export interface KindGuess {
  readonly kind: ProjectKind;
  /** 0…1: how clearly this kind beat the others. */
  readonly confidence: number;
  /** Words found in the text that point to this kind (as written, at most a few). */
  readonly evidence: readonly string[];
}

interface Rule {
  readonly kind: Exclude<ProjectKind, 'custom'>;
  /** Names of the garment: strong evidence. */
  readonly names: RegExp;
  /** Typical parts or details: weak evidence. */
  readonly parts?: RegExp;
}

const RULES: readonly Rule[] = [
  {
    kind: 'cardigan',
    names: /(?<!\p{L})(kardigan\p{L}*|cardigans?|rozpina\p{L}*|żakiet\p{L}*|zakiet\p{L}*)/giu,
    parts:
      /(?<!\p{L})(listw\p{L}*|dziur\p{L}* na guzik\p{L}*|guzik\p{L}*|buttonholes?|button bands?)/giu,
  },
  {
    kind: 'sweater',
    names: /(?<!\p{L})(swet\p{L}*|pulower\p{L}*|pullovers?|sweaters?|jumpers?)/giu,
    parts: /(?<!\p{L})(rękaw\p{L}*|rekaw\p{L}*|karcz\p{L}*|raglan\p{L}*|sleeves?|yoke)/giu,
  },
  {
    kind: 'vest',
    names:
      /(?<!\p{L})(kamizel\p{L}*|bezrękawnik\p{L}*|bezrekawnik\p{L}*|vests?|slipovers?|tank tops?)/giu,
    parts: /(?<!\p{L})(podkr\p{L}*|armholes?)/giu,
  },
  {
    kind: 'hat',
    names: /(?<!\p{L})(czap\p{L}*|beanies?|hats?|berety?|berets?|kominiar\p{L}*)/giu,
    parts: /(?<!\p{L})(denk\p{L}*|pompon\p{L}*|crown)/giu,
  },
  {
    kind: 'scarf',
    names: /(?<!\p{L})(szalik\p{L}*|scarf|scarves|szal(?!\p{L})|szala(?!\p{L}))/giu,
  },
  {
    kind: 'cowl',
    names:
      /(?<!\p{L})(komin(?!\p{L})|komina(?!\p{L})|kominy(?!\p{L})|kominie(?!\p{L})|cowls?|snoods?|tub[aęy](?!\p{L})|neck ?warmers?)/giu,
  },
  {
    kind: 'mittens',
    names:
      /(?<!\p{L})(rękawicz\p{L}*|rekawicz\p{L}*|łapawic\p{L}*|mitenk\p{L}*|mittens?|gloves?)/giu,
    parts: /(?<!\p{L})(kciuk\p{L}*|thumbs?|palc\p{L}*|fingers?)/giu,
  },
  {
    kind: 'socks',
    names: /(?<!\p{L})(skarpet\p{L}*|podkolanów\p{L}*|socks?|stockings?)/giu,
    parts: /(?<!\p{L})(pięt\p{L}*|piet\p{L}*|cholew\p{L}*|heels?|toes?|gussets?)/giu,
  },
];

const count = (re: RegExp, text: string): { n: number; words: string[] } => {
  const words = [...text.matchAll(re)].map((m) => m[0]);
  return { n: words.length, words };
};

/**
 * Guess the kind of project. `title` is text that names the project (typed name, file name);
 * `text` is the document. Null when nothing points to any kind.
 */
export function detectKind(text: string, title = ''): KindGuess | null {
  const head = `${title}\n${text.slice(0, 400)}`.toLowerCase();
  const body = text.toLowerCase();
  const scored = RULES.map((r) => {
    const inHead = count(r.names, head);
    const inBody = count(r.names, body);
    const parts = r.parts ? count(r.parts, body) : { n: 0, words: [] };
    const score = 6 * Math.min(inHead.n, 2) + 2 * Math.min(inBody.n, 5) + Math.min(parts.n, 6);
    const evidence = [...new Set([...inHead.words, ...inBody.words, ...parts.words])].slice(0, 4);
    return { kind: r.kind, score, evidence };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 3) return null;
  const confidence = Math.max(0, Math.min(1, (best.score - (second?.score ?? 0)) / best.score));
  return { kind: best.kind, confidence, evidence: best.evidence };
}
