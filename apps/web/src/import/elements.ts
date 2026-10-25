import {
  applyDesign,
  blankProject,
  designFromLayout,
  fileMotifs,
  insertPattern,
  mapPattern,
  patternRegistry,
  PROJECT_KIND_INFO,
  resolvePattern,
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
    const parts = partsOf(item, state);
    const charts = [...new Set(state.charts)]
      .sort((a, b) => a - b)
      .flatMap((i) => (input.charts[i] ? [input.charts[i]] : []));
    // The description lays out one round: it fits the main element when that is one piece and
    // names its charts; otherwise the charts go side by side.
    const sequence =
      item.id === main && parts.length === 1 ? describedSequence(input.layout, charts) : null;
    const described = sequence !== null;
    for (const part of parts) {
      const built: Pattern = buildPattern({
        id: part.id,
        name: part.label[input.lang],
        sizes: input.sizes,
        charts,
        legend: input.legend,
        sequence: sequence ?? charts.map((c) => ({ chart: c.name })),
        ...(described && input.layout.stitchCount ? { stitchCount: input.layout.stitchCount } : {}),
        ...(described && input.layout.marker ? { marker: input.layout.marker } : {}),
        sectionNames: input.layout.sectionNames,
      });
      const pattern: Pattern = charts.length === 0 ? { ...built, tracking: 'rows' } : built;
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
): Project {
  let design;
  try {
    design = designFromLayout(
      resolvePattern(project, patternId, { sizeIndex: project.sizeIndex, registry }),
    );
  } catch {
    return project;
  }
  if (!design) return project;
  return mapPattern(project, patternId, (p) => applyDesign({ ...p, design }, patternRegistry(p)));
}
