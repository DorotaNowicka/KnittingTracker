import type { LocalizedText } from '../basics';
import { PROJECT_KINDS, type ProjectKind } from '../schema/pattern';

/**
 * The usual parts of each kind of project, in knitting order (top-down garments reverse some of
 * it). Each part is a candidate pattern (wzór) of the project. A choice lists alternatives, e.g. a
 * sweater body knitted in the round (one pattern) or as a back and a front (two patterns).
 */
export interface KindPart {
  readonly id: string;
  readonly label: LocalizedText;
  /** Knitted this many times with the same pattern (e.g. 2 sleeves). Default 1. */
  readonly count?: number;
  /** Not every garment of this kind has it. */
  readonly optional?: boolean;
  readonly hint?: LocalizedText;
}

export interface KindChoice {
  readonly id: string;
  readonly label: LocalizedText;
  readonly options: readonly {
    readonly id: string;
    readonly label: LocalizedText;
    readonly parts: readonly KindPart[];
  }[];
}

export type KindItem =
  ({ readonly type: 'part' } & KindPart) | ({ readonly type: 'choice' } & KindChoice);

export interface KindInfo {
  readonly id: ProjectKind;
  readonly label: LocalizedText;
  /** Knitted as a pair (left and right): every part is made twice. */
  readonly pair?: boolean;
  /** The item a pattern description's main chart layout belongs to (e.g. the body). */
  readonly main: string;
  /** Items in the usual knitting order (bottom-up, cuff-down…). */
  readonly items: readonly KindItem[];
  /** The direction `items` follow, e.g. "from the bottom". */
  readonly usualWay: LocalizedText;
  /** The other common direction (top-down, toe-up) and the order of the items then. */
  readonly otherWay?: { readonly label: LocalizedText; readonly order: readonly string[] };
}

const t = (pl: string, en: string): LocalizedText => ({ pl, en });
const part = (id: string, label: LocalizedText, more: Omit<KindPart, 'id' | 'label'> = {}) =>
  ({ type: 'part', id, label, ...more }) as const;

const bottomRib = part('bottom-rib', t('Ściągacz dołu', 'Bottom ribbing'));
const yoke = part('yoke', t('Karczek', 'Yoke'), {
  optional: true,
  hint: t(
    'Przy swetrze robionym od góry: raglan albo karczek okrągły.',
    'In a top-down garment: raglan or a round yoke.',
  ),
});
const sleeve = part('sleeve', t('Rękaw', 'Sleeve'), { count: 2 });
const cuff = part('sleeve-cuff', t('Ściągacz rękawa', 'Sleeve cuff'), { count: 2 });

const body = (pieces: readonly KindPart[]) =>
  ({
    type: 'choice',
    id: 'body',
    label: t('Korpus', 'Body'),
    options: [
      {
        id: 'round',
        label: t('Na okrągło, w jednym kawałku', 'In the round, in one piece'),
        parts: [{ id: 'body', label: t('Korpus', 'Body') }],
      },
      { id: 'pieces', label: t('Z osobnych części', 'In separate pieces'), parts: pieces },
    ],
  }) as const;

const back = { id: 'back', label: t('Tył', 'Back') };
const front = { id: 'front', label: t('Przód', 'Front') };

export const PROJECT_KIND_INFO: Readonly<Record<ProjectKind, KindInfo>> = {
  sweater: {
    id: 'sweater',
    usualWay: t('od dołu', 'bottom-up'),
    otherWay: {
      label: t('od góry', 'top-down'),
      order: ['neck', 'yoke', 'body', 'bottom-rib', 'sleeve', 'sleeve-cuff'],
    },
    main: 'body',
    label: t('Sweter', 'Sweater'),
    items: [
      bottomRib,
      body([back, front]),
      yoke,
      sleeve,
      cuff,
      part('neck', t('Dekolt / golf', 'Neckline / collar')),
    ],
  },
  cardigan: {
    id: 'cardigan',
    usualWay: t('od dołu', 'bottom-up'),
    otherWay: {
      label: t('od góry', 'top-down'),
      order: [
        'neck',
        'yoke',
        'body',
        'bottom-rib',
        'sleeve',
        'sleeve-cuff',
        'buttonhole-band',
        'button-band',
      ],
    },
    main: 'body',
    label: t('Kardigan', 'Cardigan'),
    items: [
      bottomRib,
      body([
        back,
        { id: 'left-front', label: t('Lewy przód', 'Left front') },
        { id: 'right-front', label: t('Prawy przód', 'Right front') },
      ]),
      yoke,
      sleeve,
      cuff,
      part('neck', t('Dekolt', 'Neckline')),
      part('buttonhole-band', t('Listwa z dziurkami', 'Buttonhole band')),
      part('button-band', t('Listwa pod guziki', 'Button band')),
    ],
  },
  vest: {
    id: 'vest',
    usualWay: t('od dołu', 'bottom-up'),
    main: 'body',
    label: t('Kamizelka', 'Vest'),
    items: [
      bottomRib,
      body([back, front]),
      part('armhole', t('Wykończenie podkroju', 'Armhole edging'), { count: 2 }),
      part('neck', t('Dekolt', 'Neckline')),
    ],
  },
  hat: {
    id: 'hat',
    usualWay: t('od brzegu', 'brim-up'),
    otherWay: { label: t('od denka', 'crown-down'), order: ['crown', 'body', 'brim'] },
    main: 'body',
    label: t('Czapka', 'Hat'),
    items: [
      part('brim', t('Ściągacz / wywinięcie', 'Brim')),
      part('body', t('Korpus czapki', 'Body')),
      part('crown', t('Denko (ujmowanie)', 'Crown (decreases)')),
    ],
  },
  scarf: {
    id: 'scarf',
    usualWay: t('od początku do końca', 'end to end'),
    main: 'main',
    label: t('Szalik', 'Scarf'),
    items: [
      part('start-border', t('Brzeg początkowy', 'Cast-on border'), { optional: true }),
      part('main', t('Główna część', 'Main part')),
      part('end-border', t('Brzeg końcowy', 'Bind-off border'), { optional: true }),
    ],
  },
  cowl: {
    id: 'cowl',
    usualWay: t('od dołu', 'bottom-up'),
    otherWay: { label: t('od góry', 'top-down'), order: ['top-rib', 'main', 'bottom-rib'] },
    main: 'main',
    label: t('Komin', 'Cowl'),
    items: [
      part('bottom-rib', t('Ściągacz dolny', 'Bottom ribbing')),
      part('main', t('Główna część', 'Main part')),
      part('top-rib', t('Ściągacz górny', 'Top ribbing')),
    ],
  },
  mittens: {
    id: 'mittens',
    usualWay: t('od mankietu', 'cuff-up'),
    main: 'hand',
    label: t('Rękawiczki', 'Mittens and gloves'),
    pair: true,
    items: [
      part('cuff', t('Mankiet (ściągacz)', 'Cuff (ribbing)')),
      part('hand', t('Dłoń', 'Hand')),
      part('thumb-gusset', t('Klin kciuka', 'Thumb gusset')),
      part('thumb', t('Kciuk', 'Thumb')),
      {
        type: 'choice',
        id: 'top',
        label: t('Rodzaj', 'Type'),
        options: [
          {
            id: 'mittens',
            label: t('Jednopalczaste', 'Mittens'),
            parts: [{ id: 'top', label: t('Szczyt dłoni', 'Top of the hand') }],
          },
          {
            id: 'gloves',
            label: t('Z palcami', 'Gloves'),
            parts: [{ id: 'fingers', label: t('Palce', 'Fingers'), count: 4 }],
          },
          {
            id: 'fingerless',
            label: t('Mitenki', 'Fingerless'),
            parts: [{ id: 'top-edge', label: t('Wykończenie górne', 'Top edging') }],
          },
        ],
      },
    ],
  },
  socks: {
    id: 'socks',
    usualWay: t('od mankietu', 'cuff-down'),
    otherWay: {
      label: t('od palców', 'toe-up'),
      order: ['toe', 'foot', 'gusset', 'heel', 'leg', 'cuff'],
    },
    main: 'leg',
    label: t('Skarpetki', 'Socks'),
    pair: true,
    items: [
      part('cuff', t('Ściągacz', 'Cuff')),
      part('leg', t('Cholewka', 'Leg')),
      part('heel', t('Pięta', 'Heel')),
      part('gusset', t('Klin', 'Gusset')),
      part('foot', t('Stopa', 'Foot')),
      part('toe', t('Czubek', 'Toe')),
    ],
  },
  custom: {
    id: 'custom',
    usualWay: t('po kolei', 'in order'),
    label: t('Własny projekt', 'Custom project'),
    main: 'main',
    items: [],
  },
};

/** The kinds in the order the "what are you knitting" screen shows them. */
export const PROJECT_KIND_LIST: readonly KindInfo[] = PROJECT_KINDS.map(
  (k) => PROJECT_KIND_INFO[k],
);

/** Garments whose body, knitted in the round in one piece, has a front and a back. */
const FRONT_AND_BACK: readonly ProjectKind[] = ['sweater', 'cardigan', 'vest'];

/**
 * True for the part that is knitted in the round as a front and a back side by side (a sweater's
 * body in one piece): the pattern creator splits its grid in halves.
 */
export const splitsFrontBack = (kind: ProjectKind | undefined, partId: string): boolean =>
  !!kind && FRONT_AND_BACK.includes(kind) && partId === 'body';
