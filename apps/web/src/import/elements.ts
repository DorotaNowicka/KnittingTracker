import {
  applyDesign,
  blankProject,
  designFromLayout,
  fileMotifs,
  insertPattern,
  mapPattern,
  patternRegistry,
  plainKnit,
  PROJECT_KIND_INFO,
  resolvePattern,
  splitsFrontBack,
  STD,
  type KindItem,
  type KindPart,
  type LegendEntry,
  type Locale,
  type Pattern,
  type Project,
  type ProjectKind,
  type SymbolRegistry,
} from '@kt/core';
import { buildPattern, type DraftChart } from '@kt/importer';

/**
 * The parts of a garment in the import check (e.g. a sweater's body, sleeves, neckline): what the
 * knitter chose for each, and how the project's patterns are built from those choices. Pure, so
 * the screen and the tests share it.
 */
export interface ElementState {
  /** The element becomes a pattern of the project. */
  readonly include: boolean;
  /** Chosen option of a choice item (e.g. body "round" or "pieces"); null for a plain part. */
  readonly option: string | null;
  /** Recognised charts (indices into the import's charts) used in this element. */
  readonly charts: readonly number[];
  /** Parts of the chosen option the knitter does not track (e.g. only the front of the body). */
  readonly skip?: readonly string[];
}

/**
 * A part as the knitter set it up in "Popraw": the charts of a round in knitting order, the
 * stitches of the round and the length to knit. Kept per part (a back and a front differ).
 */
export interface PartSetup {
  /** Charts in knitting order, the first from stitch 1 (the right edge): chart index, stitches. */
  readonly sequence: readonly { readonly chart: number; readonly stitches: number }[];
  /** Stitches in a round (or row) at the chosen size. */
  readonly stitches: number;
  /** Length to knit in cm; null: none; undefined: what the file says. */
  readonly cm?: number | null;
}

export type Elements = Readonly<Record<string, ElementState>>;

/** "Own project" has no fixed parts: one pattern holds everything. */
const CUSTOM_ITEMS: readonly KindItem[] = [
  { type: 'part', id: 'main', label: { pl: 'Wzór', en: 'Pattern' } },
];

export const kindItems = (kind: ProjectKind): readonly KindItem[] =>
  kind === 'custom' ? CUSTOM_ITEMS : PROJECT_KIND_INFO[kind].items;

export const mainItemId = (kind: ProjectKind): string => PROJECT_KIND_INFO[kind].main;

/** The kind's items in knitting order (`order`: item ids; unknown ids are ignored, missing items
 * keep their usual place after the ordered ones). */
export function orderedItems(
  kind: ProjectKind,
  order: readonly string[] = [],
): readonly KindItem[] {
  const items = kindItems(kind);
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length + items.findIndex((it) => it.id === id) : i;
  };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * Starting point: every part that every garment of this kind has is included, optional parts are
 * not, choices take their first option, and all recognised charts go to the main element (the
 * body of a sweater, the leg of a sock): pattern PDFs describe the main chart layout.
 */
export function initialElements(kind: ProjectKind, chartCount: number): Elements {
  const main = mainItemId(kind);
  const all = Array.from({ length: chartCount }, (_, i) => i);
  return Object.fromEntries(
    kindItems(kind).map((item) => [
      item.id,
      {
        include: item.type === 'choice' || !item.optional,
        option: item.type === 'choice' ? (item.options[0]?.id ?? null) : null,
        charts: item.id === main ? all : [],
      },
    ]),
  );
}

/** The parts an item stands for: itself, or the parts of the chosen option. */
export function partsOf(item: KindItem, state: ElementState | undefined): readonly KindPart[] {
  if (item.type === 'part') return [item];
  const option = item.options.find((o) => o.id === state?.option) ?? item.options[0];
  return option?.parts ?? [];
}

/** The parts of an item the knitter tracks: those of the chosen option she didn't leave out. */
export const trackedPartsOf = (item: KindItem, state: ElementState | undefined) =>
  partsOf(item, state).filter((p) => !state?.skip?.includes(p.id));

export interface MainLayout {
  readonly sequence: readonly { readonly chart: string; readonly stitches?: readonly number[] }[];
  readonly stitchCount?: readonly number[];
  readonly marker?: readonly number[];
  readonly sectionNames: readonly [string, string];
}

/** The description's round, kept to the given charts; null when it names none of them. */
export function describedSequence(
  layout: MainLayout,
  charts: readonly { readonly name: string }[],
): MainLayout['sequence'] | null {
  const names = new Set(charts.map((c) => c.name));
  const kept = layout.sequence.filter((s) => names.has(s.chart));
  return kept.length > 0 ? kept : null;
}

export interface BuildInput {
  readonly id: string;
  readonly name: string;
  readonly kind: ProjectKind;
  readonly sizes: readonly string[];
  readonly now: string;
  readonly lang: Locale;
  /** All recognised charts, index-aligned with `ElementState.charts`. */
  readonly charts: readonly DraftChart[];
  readonly legend: readonly LegendEntry[];
  /** Chart order of a round from the description; used for the main element. */
  readonly layout: MainLayout;
  readonly elements: Elements;
  /** Knitting order of the items (ids); the usual order when left out. */
  readonly order?: readonly string[];
  /** Parts the knitter set up herself (part id → setup). */
  readonly setups?: Readonly<Record<string, PartSetup>>;
  /** Length to knit per part id (cm, chosen size) as the file says. */
  readonly lengths?: Readonly<Record<string, number>>;
}

/** Name of the plain knit filler beside a centred pattern. */
const FILL_NAME: Readonly<Record<Locale, string>> = { pl: 'Prawe', en: 'Knit' };

/** Chart width of a recognised chart (its first row). */
const widthOf = (chart: DraftChart | undefined) => chart?.rows[0]?.length ?? 0;

/**
 * The part's setup as the import reads it, before the knitter changes anything: the main part
 * follows the description's round (its stitches at the chosen size), others their charts once.
 */
export function defaultSetup(args: {
  readonly kind: ProjectKind;
  readonly item: KindItem;
  readonly state: ElementState | undefined;
  readonly charts: readonly DraftChart[];
  readonly layout: MainLayout;
  readonly sizeIndex: number;
}): PartSetup {
  const { item, state, charts, layout, sizeIndex } = args;
  const own = [...new Set(state?.charts ?? [])].sort((a, b) => a - b);
  const ownCharts = own.flatMap((i) => (charts[i] ? [charts[i]] : []));
  const described =
    item.id === mainItemId(args.kind) && partsOf(item, state).length === 1
      ? describedSequence(layout, ownCharts)
      : null;
  const index = (name: string) => own.find((i) => charts[i]?.name === name) ?? -1;
  const sequence = described
    ? described.flatMap((s) => {
        const i = index(s.chart);
        const stitches = s.stitches?.[sizeIndex] ?? widthOf(charts[i]);
        return i < 0 ? [] : [{ chart: i, stitches }];
      })
    : own.map((i) => ({ chart: i, stitches: widthOf(charts[i]) }));
  const used = sequence.reduce((n, s) => n + s.stitches, 0);
  const stated = described ? layout.stitchCount?.[sizeIndex] : undefined;
  return { sequence, stitches: stated ?? used };
}

/**
 * A pattern from a part's setup. Its charts take the stitches set for each; when they cover less
 * than the round, they sit in the middle with plain knit on both sides — for a body knitted in
 * the round (front and back), in the middle of the front and again of the back.
 */
function patternFromSetup(
  input: BuildInput,
  part: KindPart,
  setup: PartSetup,
  halves: boolean,
): Pattern {
  const n = Math.max(1, input.sizes.length);
  const each = (v: number) => Array.from({ length: n }, () => v);
  const fill: DraftChart = { name: FILL_NAME[input.lang], rows: [[STD.knit]] };
  const items = setup.sequence.flatMap((s) => {
    const c = input.charts[s.chart];
    return c && s.stitches > 0 ? [{ chart: c.name, stitches: s.stitches }] : [];
  });
  const used = items.reduce((sum, s) => sum + s.stitches, 0);
  const total = Math.max(1, setup.stitches);
  const centred = (width: number) => {
    if (width <= used || items.length === 0) return items;
    const right = Math.floor((width - used) / 2);
    const left = width - used - right;
    return [
      ...(right > 0 ? [{ chart: fill.name, stitches: right }] : []),
      ...items,
      ...(left > 0 ? [{ chart: fill.name, stitches: left }] : []),
    ];
  };
  const front = Math.ceil(total / 2);
  const twice = halves && items.length > 0 && used <= total - front;
  const sequence = twice ? [...centred(front), ...centred(total - front)] : centred(total);
  const charts = [
    ...new Set(setup.sequence.map((s) => s.chart).filter((i) => input.charts[i] !== undefined)),
  ].flatMap((i) => (input.charts[i] ? [input.charts[i]] : []));
  const usesFill = sequence.some((s) => s.chart === fill.name);
  return buildPattern({
    id: part.id,
    name: part.label[input.lang],
    sizes: input.sizes,
    charts: usesFill ? [...charts, fill] : charts,
    legend: input.legend,
    sequence: sequence.map((s) => ({ chart: s.chart, stitches: each(s.stitches) })),
    stitchCount: each(total),
    ...(twice ? { marker: each(front) } : {}),
    sectionNames: input.layout.sectionNames,
  });
}

/**
 * A new project with one pattern per included part, in knitting order (`order`). The main element follows
 * the description's chart order; other parts place their charts side by side once. A part without
 * charts is tracked with a row counter (ribbing, plain stockinette) until charts are added.
 */
export function buildProjectFromElements(input: BuildInput): Project {
  const main = mainItemId(input.kind);
  let project = blankProject({
    id: input.id,
    name: input.name,
    kind: input.kind,
    sizes: input.sizes,
    now: input.now,
  });
  let mainPatternId: string | undefined;
  for (const item of orderedItems(input.kind, input.order)) {
    const state = input.elements[item.id];
    if (!state?.include) continue;
    const parts = trackedPartsOf(item, state);
    const charts = [...new Set(state.charts)]
      .sort((a, b) => a - b)
      .flatMap((i) => (input.charts[i] ? [input.charts[i]] : []));
    // The description lays out one round: it fits the main element when that is one piece and
    // names its charts; otherwise the charts go side by side.
    const sequence =
      item.id === main && partsOf(item, state).length === 1
        ? describedSequence(input.layout, charts)
        : null;
    const described = sequence !== null;
    for (const part of parts) {
      const setup = input.setups?.[part.id];
      const built: Pattern = setup
        ? patternFromSetup(input, part, setup, splitsFrontBack(input.kind, part.id))
        : buildPattern({
            id: part.id,
            name: part.label[input.lang],
            sizes: input.sizes,
            charts,
            legend: input.legend,
            sequence: sequence ?? charts.map((c) => ({ chart: c.name })),
            ...(described && input.layout.stitchCount
              ? { stitchCount: input.layout.stitchCount }
              : {}),
            ...(described && input.layout.marker ? { marker: input.layout.marker } : {}),
            sectionNames: input.layout.sectionNames,
          });
      // The length to knit: as set, or as the file says ("until 34 cm"); null: none.
      const cm = setup?.cm === null ? undefined : (setup?.cm ?? input.lengths?.[part.id]);
      const sized: Pattern = cm ? { ...built, targetCm: cm } : built;
      const pattern: Pattern = sized.charts.length === 0 ? { ...sized, tracking: 'rows' } : sized;
      const r = insertPattern(project, pattern);
      project = r.project;
      if (item.id === main) mainPatternId ??= r.patternId;
    }
  }
  // Every chart of the file, for the creator's library in any part.
  const all = buildPattern({
    id: 'file',
    name: 'file',
    sizes: input.sizes,
    charts: input.charts,
    legend: [],
    sequence: [],
    sectionNames: input.layout.sectionNames,
  }).charts;
  if (all.length > 0) project = { ...project, motifs: fileMotifs(all) };
  return mainPatternId ? { ...project, activePatternId: mainPatternId } : project;
}

/**
 * The project with one part's pattern turned into a creator design: its charts laid as tiles the
 * way the file's layout works them at the chosen size. Unchanged when the layout can't be built
 * or has no charts (the creator then asks for the grid size).
 */
export function withDesignFromLayout(
  project: Project,
  patternId: string,
  registry: SymbolRegistry,
  /** Names of the halves (front, back) when the part is split in two. */
  halves?: readonly [string, string],
): Project {
  let design;
  try {
    design = designFromLayout(
      resolvePattern(project, patternId, { sizeIndex: project.sizeIndex, registry }),
      // The plain knit beside a centred pattern is the grid's background, not a tile.
      { background: (c) => Object.values(FILL_NAME).includes(c.name) && plainKnit(c) },
    );
  } catch {
    return project;
  }
  if (!design) return project;
  const split = halves ? { ...design, halves: [halves[0], halves[1]] as [string, string] } : design;
  return mapPattern(project, patternId, (p) =>
    applyDesign({ ...p, design: split }, patternRegistry(p)),
  );
}
