import {
  createRegistry,
  insertPattern,
  splitsFrontBack,
  STD,
  YARN_COLORS,
  type LegendEntry,
  type Locale,
  type Project,
  type ProjectKind,
  type SymbolRows,
  type Yarn,
} from '@kt/core';
import {
  buildPattern,
  buildProject,
  colorLetter,
  descriptionBlocks,
  colorOfName,
  COLOR_PREFIX,
  type LegendKind,
  detectBodyPieces,
  isColorSymbol,
  detectKind,
  lengthOf,
  partLengths,
  PIECED_BODY,
  detectPartOrder,
  parseDescription,
  type KindGuess,
  type PartOrder,
  type ImportProgress,
  type ImportResult,
  type ParsedDescription,
  type RecognizedChart,
  UNCERTAIN_BELOW,
} from '@kt/importer';
import { create } from 'zustand';
import { newId } from '../lib/files';
import { useDraft } from '../state/draft';
import { useNewProject } from '../state/newProject';
import { useLibrary } from '../state/library';
import { ImportClient, ImportError, type CheckedFile } from './client';
import {
  buildProjectFromElements,
  defaultSetup,
  initialElements,
  kindItems,
  orderedItems,
  type PartSetup,
  withDesignFromLayout,
  type ElementState,
  type Elements,
  type MainLayout,
} from './elements';

/**
 * The symbols the legend now names, when they differ from those the charts were read with (the
 * charts should be read again); null when nothing changed.
 */
export function pendingSymbols(
  chosen: readonly (string | null)[],
  result: ImportResult,
): string[] | null {
  const symbols = [...new Set(chosen.filter((x): x is string => !!x))];
  const changed = symbols.slice().sort().join() !== [...result.symbols].sort().join();
  return changed && symbols.length > 0 ? symbols : null;
}

/** Sizes typed as "S - M - L" or "S, M, L". */
export const splitSizes = (text: string): string[] =>
  text
    .split(/\s*-\s*|\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.slice(0, 20));

/** Cells below this confidence are highlighted for checking. */
export const UNCERTAIN = UNCERTAIN_BELOW;

export interface ChartDraft {
  include: boolean;
  name: string;
  rows: SymbolRows;
  /** Colourwork: each cell's yarn letter (row 1 first), null for none; absent without colours. */
  colors?: (string | null)[][];
  /** Recognition confidence per cell (row 1 first), 1 once the user confirmed or changed it. */
  confidence: number[][];
}

type Status = 'idle' | 'straighten' | 'running' | 'verify' | 'error';

interface ImportState {
  readonly status: Status;
  readonly file: CheckedFile | null;
  readonly preview: { width: number; height: number; rgba: Uint8ClampedArray } | null;
  readonly progress: ImportProgress | null;
  readonly result: ImportResult | null;
  readonly charts: readonly ChartDraft[];
  /** Chosen symbol per legend entry (null = not a stitch symbol). */
  readonly legend: readonly (string | null)[];
  /** The knitter's own name per legend entry ('' = the file's wording). */
  readonly legendNames: readonly string[];
  /** What each legend entry is: a stitch, a yarn colour (colourwork) or a mark of a row. */
  readonly legendKinds: readonly LegendKind[];
  /** The knitter's own shade per legend colour entry (#rrggbb; null = the file's). */
  readonly legendColors: readonly (string | null)[];
  /** Make an entry a stitch, a colour or a mark; the charts are read again. */
  setLegendKind(index: number, kind: LegendKind): Promise<void>;
  setLegendColor(index: number, hex: string): void;
  /** The yarns of the project the import makes (colourwork): the legend's colours, then the charts'. */
  yarns(): Yarn[];
  readonly description: { text: string; parsed: ParsedDescription };
  readonly error: string | null;
  /** Name typed on the "new project" screen; proposed for the project the import creates. */
  readonly projectName: string;
  setProjectName(name: string): void;
  /** What the PDF looks like (sweater, socks…), recognised from its text; null when unclear. */
  readonly guess: KindGuess | null;
  /** The kind of the new project: the guess or the knitter's choice ('custom' when unclear). */
  readonly projectKind: ProjectKind;
  /** The garment's parts in the check and the charts each one uses. */
  readonly elements: Elements;
  /** In what order the pattern makes the parts. */
  readonly order: PartOrder;
  /** The knitter put the parts in her own order (the recognised one was wrong). */
  readonly orderByHand: boolean;
  /** Move a part one place earlier (-1) or later (+1) in the knitting order. */
  moveItem(id: string, delta: -1 | 1): void;
  /** Whether the text makes the body as a back and a front (headings "TYŁ", "PRZÓD"). */
  readonly bodyPieces: { readonly pieces: boolean; readonly evidence: readonly string[] };
  /** Parts the knitter set up in "Popraw" (part id → charts in order, stitches, length). */
  readonly setups: Readonly<Record<string, PartSetup>>;
  setPartSetup(partId: string, setup: PartSetup): void;
  /** The part's setup: as the knitter set it, or as the import reads it. */
  partSetup(partId: string): PartSetup;
  /** The length to knit a part to, as the text says (chosen size), with the words it's from. */
  lengthGuess(partId: string): { cm: number; evidence: string } | null;
  /**
   * Checking a new project, step by step: the size being knitted, the legend, which parts to
   * track, then a preview of the grid before the project is created.
   */
  readonly step: ImportStep;
  setStep(step: ImportStep): void;
  /** Sizes of the new project (empty: one size) and the one being knitted. */
  readonly sizes: readonly string[];
  readonly sizeIndex: number;
  setSizes(sizes: readonly string[]): void;
  setSizeIndex(index: number): void;
  /** `sizeIndex` within the current list of sizes. */
  chosenSize(): number;
  /** Change the kind; the parts start again from that kind's usual ones. */
  setProjectKind(kind: ProjectKind): void;
  updateElement(id: string, change: Partial<ElementState>): void;
  start(file: CheckedFile): Promise<void>;
  run(corners?: readonly (readonly [number, number])[]): Promise<void>;
  rerun(symbols: readonly string[]): Promise<void>;
  setLegend(index: number, symbolId: string | null): void;
  setLegendName(index: number, name: string): void;
  updateChart(index: number, change: Partial<ChartDraft>): void;
  setDescription(text: string, parsed?: ParsedDescription): void;
  addDescriptionPdf(file: CheckedFile): Promise<void>;
  reset(): void;
  /**
   * Turn the checked import into a pattern: of a new project (named `title`, with `sizes`), or
   * added to the existing project `projectId` (whose sizes are used).
   */
  create(input: CreateInput): Promise<{ projectId: string; patternId: string } | null>;
  /**
   * The project the check would create now (not stored): one pattern per chosen garment part, in
   * knitting order, at the chosen size. Used for the preview and by `createProject`.
   */
  draftProject(input: CreateProjectInput, id?: string): Project;
  /**
   * Store `draftProject`; returns the new project's id. With `designPart`, that part's pattern is
   * turned into a creator design first (its charts laid as tiles), to be corrected in the creator,
   * and every part still waits for its "Gotowe"; without it the knitter approved them all.
   */
  createProject(
    input: CreateProjectInput,
    designPart?: string,
    /** Parts already approved in the preview ("Zgadza się"): they start ready. */
    approved?: readonly string[],
  ): Promise<string>;
}

export type ImportStep = 'name' | 'size' | 'legend' | 'parts' | 'preview';

export interface CreateProjectInput {
  readonly title: string;
  /** The project's sizes (the session's, or one size when it has none). */
  readonly sizes: readonly string[];
  readonly sections: readonly [string, string];
  readonly lang: Locale;
}

export interface CreateInput {
  /** Add the pattern to this project instead of starting a new one. */
  readonly projectId?: string;
  /** Name of the new project. */
  readonly title: string;
  /** Sizes of the new project (ignored when adding to a project). */
  readonly sizes: readonly string[];
  readonly patternName: string;
  readonly sections: readonly [string, string];
}

let client: ImportClient | null = null;
const worker = () => (client ??= new ImportClient());

const codeOf = (e: unknown) => (e instanceof ImportError ? e.code : 'unreadable');

/** Recognised cells → editable symbol rows and confidences. */
export function draftOf(rec: RecognizedChart, name: string): ChartDraft {
  // Colourwork: a cell read as a legend colour is a knit stitch in that yarn; a cell of a chart
  // printed in colour keeps its stitch and gets the yarn of its fill.
  const colored = rec.cells.some((row) => row.some((c) => isColorSymbol(c.symbolId) || c.color));
  return {
    include: true,
    name,
    rows: rec.cells.map((row) =>
      row.map((c) => (c.part > 0 ? '.' : isColorSymbol(c.symbolId) ? STD.knit : c.symbolId)),
    ),
    ...(colored
      ? {
          colors: rec.cells.map((row) =>
            row.map((c) =>
              isColorSymbol(c.symbolId)
                ? colorLetter(c.symbolId)
                : c.symbolId === STD.noStitch
                  ? null
                  : (c.color ?? null),
            ),
          ),
        }
      : {}),
    confidence: rec.cells.map((row) => row.map((c) => c.confidence)),
  };
}

/** A checked chart as the project builder takes it, with its colours. */
const draftChartOf = (c: ChartDraft) => ({
  name: c.name,
  rows: c.rows,
  ...(c.colors ? { colors: c.colors } : {}),
});

const blank = { text: '', parsed: parseDescription('') };

type Checked = Pick<ImportState, 'result' | 'legend' | 'legendNames' | 'description'>;

/** Chosen legend symbols, one entry per symbol (the first wording wins), with the knitter's names. */
function legendEntries({ result, legend, legendNames }: Checked): LegendEntry[] {
  const registry = createRegistry();
  const seen = new Set<string>();
  return (result?.legend ?? []).flatMap((item, i) => {
    const symbolId = legend[i];
    if (!symbolId || !registry.has(symbolId) || seen.has(symbolId)) return [];
    seen.add(symbolId);
    const name = legendNames[i]?.trim().slice(0, 80);
    return [
      {
        symbolId,
        ...(item.text ? { text: item.text.slice(0, 500) } : {}),
        ...(name ? { name } : {}),
      },
    ];
  });
}

/** The round described in the text, kept only where it fits the project's number of sizes. */
function describedLayout(
  { description }: Checked,
  n: number,
  sectionNames: readonly [string, string],
): MainLayout {
  const d = description.parsed;
  const fit = (v: readonly number[] | undefined) => (v && v.length === n ? v : undefined);
  const sequence = (d.sequence?.value ?? []).map((s) => {
    const st = fit(s.stitches);
    return st ? { chart: s.chart, stitches: st } : { chart: s.chart };
  });
  const stitchCount = fit(d.stitchCount?.value);
  const marker = fit(d.marker?.value);
  return {
    sequence,
    ...(stitchCount ? { stitchCount } : {}),
    ...(marker ? { marker } : {}),
    sectionNames,
  };
}

/**
 * The parts of `kind`, in the order the text makes them; a body the text makes as a back and a
 * front starts "in pieces".
 */
function partsFor(kind: ProjectKind, text: string, charts: number) {
  const bodyPieces = PIECED_BODY.includes(kind)
    ? detectBodyPieces(text)
    : { pieces: false, evidence: [] };
  const initial = initialElements(kind, charts);
  // A part the text has a heading for ("KARCZEK") is in the pattern, even one not every pattern has.
  const headed = new Set(
    descriptionBlocks(text, kind).flatMap((b) => (b.type === 'part' && b.partId ? [b.partId] : [])),
  );
  const elements = Object.fromEntries(
    Object.entries(initial).map(([id, e]) => [id, headed.has(id) ? { ...e, include: true } : e]),
  );
  const body = elements['body'];
  return {
    projectKind: kind,
    elements:
      bodyPieces.pieces && body ? { ...elements, body: { ...body, option: 'pieces' } } : elements,
    order: detectPartOrder(text, kind),
    orderByHand: false,
    bodyPieces,
    setups: {},
  };
}

/** Every part id a kind can have: its parts and the parts of every option of its choices. */
const allPartIds = (kind: ProjectKind) =>
  kindItems(kind).flatMap((it) =>
    it.type === 'part' ? [it.id] : it.options.flatMap((o) => o.parts.map((p) => p.id)),
  );

/** The kind guessed from the text, with the parts it usually has. */
function kindOf(result: ImportResult, hints: string) {
  const guess = detectKind(result.text, hints);
  return { guess, ...partsFor(guess?.kind ?? 'custom', result.text, result.charts.length) };
}

const noParts = {
  guess: null,
  ...partsFor('custom', '', 0),
  step: 'name',
  sizes: [],
  sizeIndex: 0,
} as const;

export const useImport = create<ImportState>((set, get) => ({
  status: 'idle',
  file: null,
  preview: null,
  progress: null,
  result: null,
  charts: [],
  legend: [],
  legendNames: [],
  legendKinds: [],
  legendColors: [],
  description: blank,
  error: null,
  projectName: '',
  ...noParts,

  setProjectName(projectName) {
    set({ projectName });
  },

  setProjectKind(projectKind) {
    const { result, charts } = get();
    set(partsFor(projectKind, result?.text ?? '', charts.length));
  },
  moveItem(id, delta) {
    const { projectKind, order } = get();
    const ids = orderedItems(projectKind, order.order).map((it) => it.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    const a = ids[from];
    const b = ids[to];
    if (from < 0 || a === undefined || b === undefined) return;
    ids[from] = b;
    ids[to] = a;
    set({ order: { ...order, order: ids }, orderByHand: true });
  },
  setPartSetup(partId, setup) {
    set({ setups: { ...get().setups, [partId]: setup } });
  },
  partSetup(partId) {
    const state = get();
    const stored = state.setups[partId];
    if (stored) return stored;
    const item = kindItems(state.projectKind).find((it) =>
      it.type === 'part'
        ? it.id === partId
        : it.options.some((o) => o.parts.some((p) => p.id === partId)),
    );
    if (!item) return { sequence: [], stitches: 1 };
    return defaultSetup({
      kind: state.projectKind,
      item,
      state: state.elements[item.id],
      charts: state.charts.map(draftChartOf),
      layout: describedLayout(state, Math.max(1, state.sizes.length), ['', '']),
      sizeIndex: state.chosenSize(),
    });
  },
  lengthGuess(partId) {
    const state = get();
    const text = state.description.text || state.result?.text || '';
    if (!text) return null;
    return lengthOf(partLengths(text, Math.max(1, state.sizes.length)), partId, state.chosenSize());
  },

  setStep(step) {
    set({ step });
  },

  setSizes(sizes) {
    const clean = sizes
      .map((x) => x.trim().slice(0, 20))
      .filter(Boolean)
      .slice(0, 12);
    // The chosen size stays chosen when it moves; otherwise its position is kept (read clamped),
    // so typing a list letter by letter doesn't lose the choice.
    const { sizes: before, sizeIndex } = get();
    const label = before[sizeIndex];
    const moved = label === undefined ? -1 : clean.indexOf(label);
    set({ sizes: clean, sizeIndex: moved >= 0 ? moved : sizeIndex });
  },

  setSizeIndex(sizeIndex) {
    set({ sizeIndex: Math.max(0, Math.min(sizeIndex, get().sizes.length - 1)) });
  },

  chosenSize() {
    const { sizes, sizeIndex } = get();
    return Math.max(0, Math.min(sizeIndex, sizes.length - 1));
  },

  updateElement(id, change) {
    const { elements } = get();
    const current = elements[id];
    if (!current) return;
    // A chart belongs to one part: giving it to this one takes it from the others.
    const taken = change.charts?.filter((c) => !current.charts.includes(c)) ?? [];
    set({
      elements: Object.fromEntries(
        Object.entries(elements).map(([key, state]) => [
          key,
          key === id
            ? { ...state, ...change }
            : taken.length
              ? { ...state, charts: state.charts.filter((c) => !taken.includes(c)) }
              : state,
        ]),
      ),
    });
  },

  async start(file) {
    set({ file, error: null, result: null, charts: [], preview: null, description: blank });
    if (file.kind === 'image') {
      try {
        const preview = await worker().decode(file);
        set({ status: 'straighten', preview });
      } catch (e) {
        set({ status: 'error', error: codeOf(e) });
      }
      return;
    }
    await get().run();
  },

  async run(corners) {
    const { file } = get();
    if (!file) return;
    set({ status: 'running', progress: null, error: null });
    try {
      const result = await worker().recognize(file, {
        ...(corners ? { corners } : {}),
        onProgress: (progress) => set({ progress }),
      });
      set({
        status: 'verify',
        result,
        charts: result.charts.map((c, i) => draftOf(c.recognized, c.name ?? `Schemat ${i + 1}`)),
        legend: result.legend.map((l) => (l.confidence >= 0.6 ? l.symbolId : null)),
        legendNames: result.legend.map(() => ''),
        legendKinds: result.legend.map((l) => l.kind),
        legendColors: result.legend.map(() => null),
        description: { text: result.text, parsed: result.description },
        ...kindOf(result, `${get().projectName}\n${file.name}`),
        step: 'name',
        sizes: result.description.sizes?.value ?? [],
        sizeIndex: 0,
      });
    } catch (e) {
      set({ status: 'error', error: codeOf(e) });
    }
  },

  async rerun(symbols) {
    const { result, legend, charts } = get();
    if (!result) return;
    set({ status: 'running', progress: null });
    try {
      const { legendKinds } = get();
      const items = result.legend.map((l, i) => {
        const kind = legendKinds[i] ?? l.kind;
        return {
          ...l,
          symbolId: legend[i] ?? null,
          kind,
          ...(kind === 'color'
            ? { color: l.color ?? { name: l.text.slice(0, 40), fill: null } }
            : {}),
        };
      });
      const next = await worker().rerecognize(symbols, items);
      set({
        status: 'verify',
        result: next,
        // Names and inclusion stay; cells are read again.
        charts: next.charts.map((c, i) => ({
          ...draftOf(c.recognized, charts[i]?.name ?? c.name ?? `Schemat ${i + 1}`),
          include: charts[i]?.include ?? true,
        })),
      });
    } catch (e) {
      set({ status: 'error', error: codeOf(e) });
    }
  },

  setLegend(index, symbolId) {
    set({ legend: get().legend.map((v, i) => (i === index ? symbolId : v)) });
  },

  setLegendName(index, name) {
    const names = [...get().legendNames];
    names[index] = name.slice(0, 80);
    set({ legendNames: names });
  },

  async setLegendKind(index, kind) {
    const { result, legend, legendKinds } = get();
    const item = result?.legend[index];
    if (!result || !item || legendKinds[index] === kind) return;
    let symbolId: string | null = null;
    if (kind === 'color') {
      // The next letter no other colour entry has.
      const taken = new Set(legend.filter(isColorSymbol).map(colorLetter));
      const letter = [...'ABCDEFGHIJKL'].find((l) => !taken.has(l));
      if (!letter) return;
      symbolId = `${COLOR_PREFIX}${letter}`;
    } else if (kind === 'stitch') {
      const best = item.matches[0];
      symbolId = item.meaning?.symbolId ?? (best && best.score >= 0.55 ? best.value : null);
    }
    set({
      legend: legend.map((v, i) => (i === index ? symbolId : v)),
      legendKinds: legendKinds.map((k, i) => (i === index ? kind : k)),
    });
    // Read the charts again with the symbols and colours now chosen.
    const chosen = [...new Set(get().legend.filter((v): v is string => !!v))];
    await get().rerun(
      chosen.length >= 2 ? chosen : result.symbols.filter((x) => !isColorSymbol(x)),
    );
  },

  setLegendColor(index, hex) {
    set({ legendColors: get().legendColors.map((v, i) => (i === index ? hex : v)) });
  },

  yarns() {
    const { result, legend, legendNames, legendColors } = get();
    const out: Yarn[] = [];
    legend.forEach((id, i) => {
      if (!isColorSymbol(id)) return;
      const letter = colorLetter(id);
      if (out.some((y) => y.id === letter)) return;
      const item = result?.legend[i];
      const name = (legendNames[i]?.trim() || item?.color?.name || item?.text || letter).slice(
        0,
        40,
      );
      const found = result?.colors.find((c) => c.id === letter)?.hex;
      const color =
        legendColors[i] ??
        found ??
        (item?.color ? colorOfName(item.color.name) : null) ??
        YARN_COLORS['ABCDEFGHIJKL'.indexOf(letter)] ??
        '#808080';
      out.push({ id: letter, name, color });
    });
    // Colours seen only in charts printed in colour.
    for (const c of result?.colors ?? []) {
      if (out.some((y) => y.id === c.id)) continue;
      out.push({ id: c.id, name: c.name || c.id, color: c.hex ?? YARN_COLORS[0] ?? '#808080' });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  },

  updateChart(index, change) {
    set({ charts: get().charts.map((c, i) => (i === index ? { ...c, ...change } : c)) });
  },

  setDescription(text, parsed) {
    set({ description: { text, parsed: parsed ?? parseDescription(text) } });
  },

  async addDescriptionPdf(file) {
    const { text, description } = await worker().text(file);
    set({ description: { text, parsed: description } });
  },

  /** Back to picking a file. The project name stays (it was typed before the file was chosen). */
  reset() {
    client?.cancel();
    set({
      status: 'idle',
      file: null,
      preview: null,
      progress: null,
      result: null,
      charts: [],
      legend: [],
      legendNames: [],
      legendKinds: [],
      legendColors: [],
      description: blank,
      error: null,
      ...noParts,
    });
  },

  async create({ projectId, title, sizes: newSizes, patternName, sections }) {
    const { charts } = get();
    const library = useLibrary.getState();
    const target = projectId ? library.project(projectId) : undefined;
    if (projectId && !target) return null;
    const sizes = target ? target.sizes : newSizes;
    const { sequence, ...rest } = describedLayout(get(), sizes.length, sections);
    const draft = {
      id: patternName,
      name: patternName,
      sizes,
      charts: charts.filter((c) => c.include).map(draftChartOf),
      legend: legendEntries(get()),
      sequence,
      ...(rest.stitchCount ? { stitchCount: rest.stitchCount } : {}),
      ...(rest.marker ? { marker: rest.marker } : {}),
      sectionNames: sections,
    };
    const now = new Date().toISOString();
    const text = fileText(get());
    if (target) {
      // Pending edits of the open project are written first, so nothing is lost.
      await useDraft.getState().flush();
      let patternId = '';
      await library.updateProject(target.id, (p) => {
        const r = insertPattern(p, buildPattern(draft));
        patternId = r.patternId;
        // A project without a description takes this file's text; one that has it keeps its own.
        const described = !r.project.description && text ? { description: text } : {};
        // The file's yarns join the project's (letters it has already keep its own).
        const own = r.project.yarns ?? [];
        const added = get()
          .yarns()
          .filter((y) => !own.some((o) => o.id === y.id));
        const yarns = added.length > 0 ? { yarns: [...own, ...added] } : {};
        return { ...r.project, ...described, ...yarns, updatedAt: now };
      });
      return patternId ? { projectId: target.id, patternId } : null;
    }
    const built = buildProject({ ...draft, projectId: newId(), title, now });
    const yarns = get().yarns();
    const project = {
      ...built,
      ...(text ? { description: text } : {}),
      ...(yarns.length > 0 ? { yarns } : {}),
    };
    await library.addProject(project);
    set({ projectName: '' });
    useNewProject.getState().setName('');
    return { projectId: project.id, patternId: project.patterns[0]?.id ?? '' };
  },

  draftProject({ title, sizes, sections, lang }, id = 'draft') {
    const state = get();
    const built = buildProjectFromElements({
      id,
      name: title,
      kind: state.projectKind,
      sizes,
      now: new Date().toISOString(),
      lang,
      charts: state.charts.map(draftChartOf),
      legend: legendEntries(state),
      layout: describedLayout(state, sizes.length, sections),
      elements: state.elements,
      order: state.order.order,
      setups: state.setups,
      lengths: Object.fromEntries(
        allPartIds(state.projectKind).flatMap((id) => {
          const cm = state.lengthGuess(id)?.cm;
          return cm ? [[id, cm]] : [];
        }),
      ),
    });
    const text = fileText(state);
    const yarns = state.yarns();
    return {
      ...built,
      sizeIndex: Math.min(state.chosenSize(), sizes.length - 1),
      ...(text ? { description: text } : {}),
      ...(yarns.length > 0 ? { yarns } : {}),
    };
  },

  async createProject(input, designPart, approved = []) {
    const draft = get().draftProject(input, newId());
    const designed = designPart
      ? withDesignFromLayout(
          draft,
          designPart,
          createRegistry(),
          splitsFrontBack(draft.kind, designPart) ? input.sections : undefined,
        )
      : draft;
    // "Zgadza się": every part when knitting starts; else the parts approved so far.
    const project = {
      ...designed,
      patterns: designed.patterns.map((p) =>
        !designPart || approved.includes(p.id) ? { ...p, ready: true } : p,
      ),
    };
    await useLibrary.getState().addProject(project);
    set({ projectName: '' });
    useNewProject.getState().setName('');
    return project.id;
  },
}));

/** The file's text, kept with the project: the tracker and the creator show it beside the grid. */
function fileText(state: Pick<ImportState, 'description' | 'result'>): string {
  return (state.description.text || state.result?.text || '').trim().slice(0, 100000);
}

/** The symbol a new or unknown cell gets. */
export const FALLBACK = STD.knit;
