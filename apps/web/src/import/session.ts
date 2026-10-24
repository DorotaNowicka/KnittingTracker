import {
  createRegistry,
  insertPattern,
  STD,
  type LegendEntry,
  type Locale,
  type Project,
  type ProjectKind,
  type SymbolRows,
} from '@kt/core';
import {
  buildPattern,
  buildProject,
  detectKind,
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
  initialElements,
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
  /** Store `draftProject`; returns the new project's id. */
  createProject(input: CreateProjectInput): Promise<string>;
}

export type ImportStep = 'size' | 'legend' | 'parts' | 'preview';

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
  return {
    include: true,
    name,
    rows: rec.cells.map((row) => row.map((c) => (c.part === 0 ? c.symbolId : '.'))),
    confidence: rec.cells.map((row) => row.map((c) => c.confidence)),
  };
}

const blank = { text: '', parsed: parseDescription('') };

type Checked = Pick<ImportState, 'result' | 'legend' | 'description'>;

/** Chosen legend symbols, one entry per symbol (the first wording wins). */
function legendEntries({ result, legend }: Checked): LegendEntry[] {
  const registry = createRegistry();
  const seen = new Set<string>();
  return (result?.legend ?? []).flatMap((item, i) => {
    const symbolId = legend[i];
    if (!symbolId || !registry.has(symbolId) || seen.has(symbolId)) return [];
    seen.add(symbolId);
    return [{ symbolId, ...(item.text ? { text: item.text.slice(0, 500) } : {}) }];
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

/** The parts of `kind`, in the order the text makes them. */
const partsFor = (kind: ProjectKind, text: string, charts: number) => ({
  projectKind: kind,
  elements: initialElements(kind, charts),
  order: detectPartOrder(text, kind),
});

/** The kind guessed from the text, with the parts it usually has. */
function kindOf(result: ImportResult, hints: string) {
  const guess = detectKind(result.text, hints);
  return { guess, ...partsFor(guess?.kind ?? 'custom', result.text, result.charts.length) };
}

const noParts = {
  guess: null,
  ...partsFor('custom', '', 0),
  step: 'size',
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
        description: { text: result.text, parsed: result.description },
        ...kindOf(result, `${get().projectName}\n${file.name}`),
        step: 'size',
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
      const items = result.legend.map((l, i) => ({ ...l, symbolId: legend[i] ?? null }));
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
      charts: charts.filter((c) => c.include).map((c) => ({ name: c.name, rows: c.rows })),
      legend: legendEntries(get()),
      sequence,
      ...(rest.stitchCount ? { stitchCount: rest.stitchCount } : {}),
      ...(rest.marker ? { marker: rest.marker } : {}),
      sectionNames: sections,
    };
    const now = new Date().toISOString();
    if (target) {
      // Pending edits of the open project are written first, so nothing is lost.
      await useDraft.getState().flush();
      let patternId = '';
      await library.updateProject(target.id, (p) => {
        const r = insertPattern(p, buildPattern(draft));
        patternId = r.patternId;
        return { ...r.project, updatedAt: now };
      });
      return patternId ? { projectId: target.id, patternId } : null;
    }
    const project = buildProject({ ...draft, projectId: newId(), title, now });
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
      charts: state.charts.map((c) => ({ name: c.name, rows: c.rows })),
      legend: legendEntries(state),
      layout: describedLayout(state, sizes.length, sections),
      elements: state.elements,
      order: state.order.order,
    });
    return { ...built, sizeIndex: Math.min(state.chosenSize(), sizes.length - 1) };
  },

  async createProject(input) {
    const project = get().draftProject(input, newId());
    await useLibrary.getState().addProject(project);
    set({ projectName: '' });
    useNewProject.getState().setName('');
    return project.id;
  },
}));

/** The symbol a new or unknown cell gets. */
export const FALLBACK = STD.knit;
