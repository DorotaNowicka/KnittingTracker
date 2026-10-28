import {
  applyDesign,
  createProgressModel,
  mapPattern,
  patternRegistry,
  initialProgress,
  reduceProgress,
  resolvePattern,
  setLegendEntry,
  type Gauge,
  type ProgressAction,
  type ProgressState,
  type ResolvedPattern,
  type RowModel,
} from '@kt/core';
import { create } from 'zustand';
import type { StoredProject } from '../lib/storage';
import { resizeDesign } from '../designer/designOps';
import { useDraft } from './draft';
import { flushProjectWrites, getStorage, useLibrary } from './library';

/**
 * not-found: no such project; no-patterns: the project has no pattern yet; pattern-missing: the
 * asked pattern is not in the project; invalid-pattern: the pattern can't be resolved.
 */
export type SessionError = 'not-found' | 'no-patterns' | 'pattern-missing' | 'invalid-pattern';

/** The tracker: one pattern of one project, with its progress. */
interface SessionState {
  readonly projectId: string | null;
  readonly patternId: string | null;
  readonly project: StoredProject | null;
  readonly grid: ResolvedPattern | null;
  readonly model: RowModel | null;
  readonly progress: ProgressState;
  readonly eraser: boolean;
  readonly error: SessionError | null;
  /** True after a failed write: shown as a warning, retried on the next change. */
  readonly saveFailed: boolean;
  /** Open a pattern of a project (default: the project's active pattern). */
  open(projectId: string, patternId?: string): Promise<void>;
  close(): void;
  dispatch(action: ProgressAction): void;
  setEraser(on: boolean): void;
  /**
   * Finish the open pattern after `rows` rows (DR-5): recorded on the project so later patterns
   * that continue its charts know where they start (DR-3).
   */
  finishPattern(rows: number): Promise<void>;
  /** Undo a finish: the pattern is open again and its row count unknown. */
  reopenPattern(patternId: string): Promise<void>;
  /**
   * Make a pattern drawn in the creator `rows` rows long: its tiles repeat up to the new top.
   * Progress past the new last row is dropped.
   */
  setDesignRows(rows: number): Promise<void>;
  /** Rename the project or set the knitter's own gauge (null removes it). */
  updateProject(change: { name?: string; gauge?: Gauge | null }): Promise<void>;
  /** The knitter's own name for a symbol in this pattern's legend ('' = the pattern's wording). */
  setLegendName(symbolId: string, name: string): Promise<void>;
}

/** Progress writes are queued so they reach storage in order, even when taps come fast. */
let writeQueue: Promise<unknown> = Promise.resolve();

async function loadProgress(projectId: string, patternId: string): Promise<ProgressState> {
  const storage = await getStorage();
  const saved = await storage.getProgress(projectId, patternId).catch(() => undefined);
  return saved
    ? { done: saved.done, undo: [...saved.undo], redo: [...saved.redo] }
    : initialProgress;
}

function build(project: StoredProject, patternId: string) {
  const grid = resolvePattern(project, patternId);
  return { grid, model: createProgressModel(grid) };
}

const empty = {
  project: null,
  grid: null,
  model: null,
  progress: initialProgress,
  error: null,
  eraser: false,
} as const;

export const useSession = create<SessionState>((set, get) => {
  /** Change the open project through the library (latest copy) and rebuild the grid. */
  const change = async (f: (p: StoredProject) => StoredProject) => {
    const { projectId, patternId } = get();
    if (!projectId || !patternId) return;
    try {
      const updated = await useLibrary.getState().updateProject(projectId, f);
      if (!updated || get().projectId !== projectId) return;
      set({ project: updated, ...build(updated, patternId) });
    } catch (error) {
      console.error('[session] saving the project failed', error);
      set({ saveFailed: true });
    }
  };

  return {
    projectId: null,
    patternId: null,
    ...empty,
    saveFailed: false,

    async open(projectId, requested) {
      set({ projectId, patternId: null, ...empty });
      // Edits made a moment ago in an editor (e.g. the size) are written before the grid is built.
      await useDraft.getState().flush();
      if (get().projectId !== projectId) return;
      const library = useLibrary.getState();
      const storage = await getStorage();
      const project = library.project(projectId) ?? (await storage.getProject(projectId));
      if (get().projectId !== projectId) return;
      if (!project) return set({ error: 'not-found' });
      const patternId = requested ?? project.activePatternId ?? project.patterns[0]?.id;
      if (!patternId) return set({ error: 'no-patterns', project });
      if (!project.patterns.some((p) => p.id === patternId)) {
        return set({ error: 'pattern-missing', project });
      }
      try {
        const built = build(project, patternId);
        const progress = await loadProgress(project.id, patternId);
        if (get().projectId !== projectId) return;
        set({ project, patternId, ...built, progress });
      } catch (error) {
        console.error('[session] cannot open pattern', error);
        return set({ error: 'invalid-pattern', project, patternId });
      }
      // The tracker opens this pattern next time too.
      if (project.activePatternId !== patternId) {
        const updated = await library
          .updateProject(projectId, (p) => ({ ...p, activePatternId: patternId }))
          .catch(() => undefined);
        if (updated && get().projectId === projectId) set({ project: updated });
        const record = await storage.getProgress(projectId, patternId).catch(() => undefined);
        useLibrary.setState((s) => ({ progress: { ...s.progress, [projectId]: record } }));
      }
    },

    close() {
      set({ projectId: null, patternId: null, ...empty });
    },

    dispatch(action) {
      const { model, progress, project, patternId } = get();
      if (!model || !project || !patternId) return;
      const next = reduceProgress(progress, action, model);
      if (next === progress) return;
      set({ progress: next });
      const now = new Date().toISOString();
      const record = {
        projectId: project.id,
        patternId,
        done: next.done,
        undo: [...next.undo],
        redo: [...next.redo],
        updatedAt: now,
      };
      writeQueue = writeQueue
        .then(async () => {
          const storage = await getStorage();
          await storage.putProgress(record);
          await useLibrary.getState().updateProject(project.id, (p) => ({ ...p, updatedAt: now }));
          if (get().saveFailed) set({ saveFailed: false });
        })
        .catch((error: unknown) => {
          console.error('[session] saving progress failed', error);
          set({ saveFailed: true });
        });
      useLibrary.getState().noteProgress(record);
    },

    setEraser(on) {
      set({ eraser: on });
    },

    async finishPattern(rows) {
      const { patternId } = get();
      if (!patternId) return;
      await change((p) => ({
        ...p,
        finishedRows: { ...p.finishedRows, [patternId]: Math.max(0, Math.floor(rows)) },
        updatedAt: new Date().toISOString(),
      }));
    },

    async reopenPattern(patternId) {
      await change((p) => {
        if (p.finishedRows?.[patternId] === undefined) return p;
        const { [patternId]: _open, ...rest } = p.finishedRows;
        const { finishedRows: _all, ...base } = p;
        return {
          ...base,
          ...(Object.keys(rest).length > 0 ? { finishedRows: rest } : {}),
          updatedAt: new Date().toISOString(),
        };
      });
    },

    async setDesignRows(rows) {
      const { patternId, model, progress } = get();
      if (!patternId) return;
      // Stitches in the rows that stay: the rows below the new top don't change.
      const kept = model ? model.rowStart(rows + 1) : progress.done;
      await change((p) => ({
        ...mapPattern(p, patternId, (pattern) =>
          pattern.design
            ? applyDesign(
                {
                  ...pattern,
                  design: resizeDesign(pattern.design, pattern.design.width, rows),
                },
                patternRegistry(pattern),
              )
            : pattern,
        ),
        updatedAt: new Date().toISOString(),
      }));
      if (get().progress.done > kept) get().dispatch({ type: 'set', done: kept });
    },

    async updateProject(update) {
      await change((p) => {
        const { knitterGauge: _old, ...base } = p;
        const gauge = update.gauge === undefined ? p.knitterGauge : update.gauge;
        return {
          ...base,
          ...(gauge ? { knitterGauge: gauge } : {}),
          name: update.name?.trim() ? update.name.trim().slice(0, 120) : p.name,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    async setLegendName(symbolId, name) {
      const { patternId } = get();
      if (!patternId) return;
      await change((p) => ({
        ...mapPattern(p, patternId, (pattern) => setLegendEntry(pattern, symbolId, { name })),
        updatedAt: new Date().toISOString(),
      }));
    },
  };
});

/** Wait until queued writes are stored (tests, page hide). */
export const flushWrites = async (): Promise<unknown> => {
  await writeQueue;
  return flushProjectWrites();
};
