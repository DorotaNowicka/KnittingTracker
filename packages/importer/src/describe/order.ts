import { PROJECT_KIND_INFO, type ProjectKind } from '@kt/core';

/**
 * In what order a pattern makes the parts of a garment. Starts from the kind's usual order, or
 * the other common one when the text says so ("od góry", "toe-up"); then, when the description
 * has section headings for at least two parts ("KORPUS", "Rękawy:"), those parts follow the
 * order of their headings. Parts without a heading keep their place.
 */
export interface PartOrder {
  /** Item ids of the kind (see `PROJECT_KIND_INFO`), first made first. */
  readonly order: readonly string[];
  /** usual: the kind's usual order; other-way: the other direction; headings: from the text. */
  readonly source: 'usual' | 'other-way' | 'headings';
  /** The words the order came from, as written. */
  readonly evidence: readonly string[];
}

const L = '\\p{L}*';
const word = (alternatives: string) =>
  new RegExp(
    `^(?:(?:wykończeni|wykonczeni|wykonani|robieni)${L}\\s+|finishing\\s+|the\\s+)?(?:${alternatives})(?!\\p{L})`,
    'iu',
  );

/** Headings per item id, tried in this order (specific names before general ones). */
type Headings = readonly (readonly [string, RegExp])[];

const garment = (bands: Headings): Headings => [
  ...bands,
  [
    'sleeve-cuff',
    word(`(?:ściągacz|sciagacz)${L} (?:rękaw|rekaw)${L}|mankiet${L}|sleeve cuffs?|cuffs?`),
  ],
  [
    'neck',
    word(
      `(?:ściągacz|sciagacz)${L} dekolt${L}|dekolt${L}|golf${L}|kołnierz${L}|kolnierz${L}|neck${L}|collar`,
    ),
  ],
  ['armhole', word(`podkr${L}|armholes?`)],
  ['bottom-rib', word(`(?:dolny )?(?:ściągacz|sciagacz)${L}|ribbing|hem|bottom rib${L}`)],
  ['yoke', word(`karcz${L}|raglan${L}|yoke`)],
  ['sleeve', word(`rękaw${L}|rekaw${L}|sleeves?`)],
  [
    'body',
    word(
      `korpus${L}|tułów${L}|tulow${L}|(?:lewy |prawy )?(?:przód|przod${L})|tył${L}|tyl(?:u)?|(?:left |right )?fronts?|back|body`,
    ),
  ],
];

const HEADINGS: Readonly<Partial<Record<ProjectKind, Headings>>> = {
  sweater: garment([]),
  cardigan: garment([
    ['buttonhole-band', word(`listw${L} z dziur${L}|buttonhole bands?`)],
    ['button-band', word(`listw${L}|button bands?|bands?`)],
  ]),
  vest: garment([]),
  hat: [
    ['crown', word(`denk${L}|ujmowani${L}|czub${L}|crown|decreases`)],
    ['brim', word(`(?:ściągacz|sciagacz)${L}|wywini${L}|brzeg${L}|brim|ribbing`)],
    ['body', word(`korpus${L}|(?:część|czesc) główna|główna (?:część|czesc)|wzór główny|body`)],
  ],
  cowl: [
    [
      'top-rib',
      word(
        `(?:górny|gorny) (?:ściągacz|sciagacz)|(?:ściągacz|sciagacz) (?:górny|gorny)|top rib${L}`,
      ),
    ],
    ['bottom-rib', word(`(?:dolny )?(?:ściągacz|sciagacz)${L}(?: dolny)?|bottom rib${L}|ribbing`)],
    [
      'main',
      word(`korpus${L}|(?:część|czesc) główna|główna (?:część|czesc)|wzór główny|body|main`),
    ],
  ],
  mittens: [
    ['thumb-gusset', word(`klin${L} kciuk${L}|thumb gussets?`)],
    ['thumb', word(`kciuk${L}|thumbs?`)],
    ['cuff', word(`mankiet${L}|(?:ściągacz|sciagacz)${L}|cuffs?`)],
    ['top', word(`szczyt${L}|palc${L}|fingers?|ujmowani${L}|top`)],
    ['hand', word(`dło${L}|dlon${L}|hands?`)],
  ],
  socks: [
    ['heel', word(`(?:ściank|sciank)${L} pięt${L}|pięt${L}|piet${L}|heel(?: flap| turn)?`)],
    ['gusset', word(`klin${L}|gussets?`)],
    ['cuff', word(`(?:ściągacz|sciagacz)${L}|mankiet${L}|cuffs?`)],
    ['leg', word(`cholew${L}|legs?`)],
    ['foot', word(`stop[aęyie](?!\\p{L})|stopy|foot`)],
    ['toe', word(`czub${L}|palc${L}|toes?`)],
  ],
};

const OTHER_WAY: Readonly<Partial<Record<ProjectKind, RegExp>>> = {
  sweater:
    /(?<!\p{L})(od gór\p{L}*|od gor\p{L}*|od dekolt\p{L}*|top[- ]down|from the top|from the neck)/iu,
  cardigan:
    /(?<!\p{L})(od gór\p{L}*|od gor\p{L}*|od dekolt\p{L}*|top[- ]down|from the top|from the neck)/iu,
  hat: /(?<!\p{L})(od denk\p{L}*|od czubk\p{L}*|top[- ]down|from the crown)/iu,
  cowl: /(?<!\p{L})(od gór\p{L}*|od gor\p{L}*|top[- ]down)/iu,
  socks: /(?<!\p{L})(od palc\p{L}*|od czubk\p{L}*|toe[- ]up)/iu,
};

/** "3.", "Krok 2:", "Step 4 –" before a heading. */
const NUMBERING = /^\s*(?:(?:krok|część|czesc|etap|step|part)\s*\d+\s*[:.–-]?\s*|\d+[.)]\s*)/iu;

/** A part's heading on this line, or null: a short line, a line in capitals, or "Name:". */
function headingOf(line: string, headings: Headings): { id: string; text: string } | null {
  const rest = line.replace(NUMBERING, '').trim();
  if (!rest) return null;
  const upper = rest === rest.toUpperCase() && /\p{Lu}/u.test(rest);
  for (const [id, re] of headings) {
    const m = re.exec(rest);
    if (!m) continue;
    const colon = /^\s*[:–-]/.test(rest.slice(m[0].length));
    return rest.length <= 32 || upper || colon ? { id, text: m[0] } : null;
  }
  return null;
}

export function detectPartOrder(text: string, kind: ProjectKind): PartOrder {
  const info = PROJECT_KIND_INFO[kind];
  let order: string[] = info.items.map((i) => i.id);
  let source: PartOrder['source'] = 'usual';
  let evidence: string[] = [];
  const other = OTHER_WAY[kind]?.exec(text);
  if (other?.[0] && info.otherWay) {
    order = [...info.otherWay.order];
    source = 'other-way';
    evidence = [other[0]];
  }
  const headings = HEADINGS[kind];
  if (!headings) return { order, source, evidence };
  const found: { id: string; text: string }[] = [];
  for (const line of text.split('\n')) {
    const h = headingOf(line, headings);
    if (h && !found.some((f) => f.id === h.id)) found.push(h);
  }
  if (found.length < 2) return { order, source, evidence };
  // The slots of the parts with a heading are refilled in the order of the headings.
  const named = new Set(found.map((f) => f.id));
  const queue = found.map((f) => f.id);
  order = order.map((id) => (named.has(id) ? (queue.shift() ?? id) : id));
  return { order, source: 'headings', evidence: found.map((f) => f.text) };
}
