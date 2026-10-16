import { createRegistry, STD, type SymbolRows } from '@kt/core';
import {
  buildPattern,
  parseDescription,
  type ImportProgress,
  type ImportResult,
  type ParsedDescription,
  type RecognizedChart,
  UNCERTAIN_BELOW,
} from '@kt/importer';
import { create } from 'zustand';
import { newId } from '../lib/files';
import type { StoredPattern } from '../lib/storage';
import { useLibrary } from '../state/library';
import { ImportClient, ImportError, type CheckedFile } from './client';

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
  start(file: CheckedFile): Promise<void>;
  run(corners?: readonly (readonly [number, number])[]): Promise<void>;
  rerun(symbols: readonly string[]): Promise<void>;
  setLegend(index: number, symbolId: string | null): void;
  updateChart(index: number, change: Partial<ChartDraft>): void;
  setDescription(text: string, parsed?: ParsedDescription): void;
  addDescriptionPdf(file: CheckedFile): Promise<void>;
  reset(): void;
  create(input: {
    title: string;
    sizes: readonly string[];
    stageName: string;
    sections: readonly [string, string];
  }): Promise<string>;
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
    });
  },

  async create({ title, sizes, stageName, sections }) {
    const { charts, result, legend, description } = get();
    const registry = createRegistry();
    const d = description.parsed;
    const n = sizes.length;
    const fit = (v: readonly number[] | undefined) => (v && v.length === n ? v : undefined);
    const id = `import-${newId().slice(0, 8)}`;
    const entries = (result?.legend ?? []).flatMap((item, i) => {
      const symbolId = legend[i];
      if (!symbolId || !registry.has(symbolId)) return [];
      return [{ symbolId, ...(item.text ? { text: item.text.slice(0, 500) } : {}) }];
    });
    // One entry per symbol (the first wording wins).
    const seen = new Set<string>();
    const unique = entries.filter((e) =>
      seen.has(e.symbolId) ? false : (seen.add(e.symbolId), true),
    );
    const sequence = (d.sequence?.value ?? []).map((s) => {
      const st = fit(s.stitches);
      return st ? { chart: s.chart, stitches: st } : { chart: s.chart };
    });
    const stitchCount = fit(d.stitchCount?.value);
    const marker = fit(d.marker?.value);
    const pattern = buildPattern({
      id,
      title,
      sizes,
      charts: charts.filter((c) => c.include).map((c) => ({ name: c.name, rows: c.rows })),
      legend: unique,
      stageName,
      sequence,
      ...(stitchCount ? { stitchCount } : {}),
      ...(marker ? { marker } : {}),
      sectionNames: sections,
    });
    const stored: StoredPattern = {
      id,
      pattern,
      source: 'file',
      importedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await useLibrary.getState().updatePattern(stored);
    return id;
  },
}));

/** The symbol a new or unknown cell gets. */
export const FALLBACK = STD.knit;
