import {
  createProgressModel,
  initialProgress,
  reduceProgress,
  resolveStage,
  type Pattern,
  type ProgressAction,
  type Gauge,
  type ProgressState,
  type ResolvedStage,
  type RowModel,
} from '@kt/core';
import { create } from 'zustand';
import type { StoredProject } from '../lib/storage';
import { getStorage, useLibrary } from './library';

export type SessionError = 'not-found' | 'pattern-missing' | 'invalid-pattern';

interface SessionState {
  readonly projectId: string | null;
  readonly project: StoredProject | null;
  readonly pattern: Pattern | null;
  readonly stage: ResolvedStage | null;
  readonly model: RowModel | null;
  readonly progress: ProgressState;
  readonly eraser: boolean;
  readonly error: SessionError | null;
  /** True after a failed write: shown as a warning, retried on the next change. */
  readonly saveFailed: boolean;
  open(projectId: string): Promise<void>;
  close(): void;
  dispatch(action: ProgressAction): void;
  setEraser(on: boolean): void;
  setStage(stageId: string): Promise<void>;
  /**
   * Finish the active stage after `rows` rows (DR-5): recorded on the project so later stages
   * that continue its charts know where they start (DR-3). Moves on to `next` when given.
   */
  finishStage(rows: number, next?: string): Promise<void>;
  /** Undo a finish: the stage is open again and its row count unknown. */
  reopenStage(stageId: string): Promise<void>;
  /** Rename the project or set the knitter's own gauge (null removes it). */
  updateProject(change: { name?: string; gauge?: Gauge | null }): Promise<void>;
}

/** Progress writes are queued so they reach storage in order, even when taps come fast. */
let writeQueue: Promise<unknown> = Promise.resolve();

async function loadProgress(projectId: string, stageId: string): Promise<ProgressState> {
  const storage = await getStorage();
  const saved = await storage.getProgress(projectId, stageId).catch(() => undefined);
  return saved
    ? { done: saved.done, undo: [...saved.undo], redo: [...saved.redo] }
    : initialProgress;
}

function build(pattern: Pattern, project: StoredProject, stageId: string) {
  const stage = resolveStage(pattern, stageId, project.sizeIndex, {
    modifications: project.modifications,
    ...(project.finishedRows ? { finishedRows: project.finishedRows } : {}),
  });
  return { stage, model: createProgressModel(stage) };
}

/** Write project metadata in the same queue as progress, so writes stay in order. */
function saveProject(project: StoredProject, onError: () => void): void {
  writeQueue = writeQueue
    .then(async () => {
      const storage = await getStorage();
      await storage.putProject(project);
    })
    .catch((error: unknown) => {
      console.error('[session] saving the project failed', error);
      onError();
    });
  useLibrary.getState().touchProject(project);
}

export const useSession = create<SessionState>((set, get) => ({
  projectId: null,
  project: null,
  pattern: null,
  stage: null,
  model: null,
  progress: initialProgress,
  eraser: false,
  error: null,
  saveFailed: false,

  async open(projectId) {
    set({
      projectId,
      project: null,
      pattern: null,
      stage: null,
      model: null,
      error: null,
      eraser: false,
      progress: initialProgress,
    });
    const storage = await getStorage();
    const project = await storage.getProject(projectId);
    if (get().projectId !== projectId) return;
    if (!project) return set({ error: 'not-found' });
    const stored = await storage.getPattern(project.patternId);
    if (!stored) return set({ error: 'pattern-missing', project });
    try {
      const { stage, model } = build(stored.pattern, project, project.activeStageId);
      const progress = await loadProgress(project.id, project.activeStageId);
      if (get().projectId !== projectId) return;
      set({ project, pattern: stored.pattern, stage, model, progress });
    } catch (error) {
      console.error('[session] cannot open project', error);
      set({ error: 'invalid-pattern', project });
    }
  },

  close() {
    set({
      projectId: null,
      project: null,
      pattern: null,
      stage: null,
      model: null,
      progress: initialProgress,
      error: null,
    });
  },

  dispatch(action) {
    const { model, progress, project, stage } = get();
    if (!model || !project || !stage) return;
    const next = reduceProgress(progress, action, model);
    if (next === progress) return;
    set({ progress: next });
    const now = new Date().toISOString();
    const record = {
      projectId: project.id,
      stageId: stage.stage.id,
      done: next.done,
      undo: [...next.undo],
      redo: [...next.redo],
      updatedAt: now,
    };
    const updatedProject = { ...project, updatedAt: now };
    writeQueue = writeQueue
      .then(async () => {
        const storage = await getStorage();
        await storage.putProgress(record);
        await storage.putProject(updatedProject);
        if (get().saveFailed) set({ saveFailed: false });
      })
      .catch((error: unknown) => {
        console.error('[session] saving progress failed', error);
        set({ saveFailed: true });
      });
    set({ project: updatedProject });
    useLibrary.getState().touchProject(updatedProject);
    useLibrary.setState((s) => ({ progress: { ...s.progress, [project.id]: record } }));
  },

  setEraser(on) {
    set({ eraser: on });
  },

  async setStage(stageId) {
    const { pattern, project } = get();
    if (!pattern || !project || stageId === project.activeStageId) return;
    const { stage, model } = build(pattern, project, stageId);
    const progress = await loadProgress(project.id, stageId);
    const updated = { ...project, activeStageId: stageId, updatedAt: new Date().toISOString() };
    set({ stage, model, progress, project: updated, eraser: false });
    saveProject(updated, () => set({ saveFailed: true }));
    const record = await getStorage().then((st) =>
      st.getProgress(project.id, stageId).catch(() => undefined),
    );
    useLibrary.setState((st) => ({ progress: { ...st.progress, [project.id]: record } }));
  },

  async finishStage(rows, next) {
    const { project, stage, pattern } = get();
    if (!project || !stage || !pattern) return;
    const updated: StoredProject = {
      ...project,
      finishedRows: { ...project.finishedRows, [stage.stage.id]: Math.max(0, Math.floor(rows)) },
      updatedAt: new Date().toISOString(),
    };
    set({ project: updated, ...build(pattern, updated, stage.stage.id) });
    saveProject(updated, () => set({ saveFailed: true }));
    if (next) await get().setStage(next);
  },

  async reopenStage(stageId) {
    const { project, stage, pattern } = get();
    if (!project || !stage || !pattern || project.finishedRows?.[stageId] === undefined) return;
    const { [stageId]: _open, ...rest } = project.finishedRows;
    const { finishedRows: _all, ...base } = project;
    const updated: StoredProject = {
      ...base,
      ...(Object.keys(rest).length > 0 ? { finishedRows: rest } : {}),
      updatedAt: new Date().toISOString(),
    };
    set({ project: updated, ...build(pattern, updated, stage.stage.id) });
    saveProject(updated, () => set({ saveFailed: true }));
  },

  async updateProject(change) {
    const { project, stage, pattern } = get();
    if (!project || !stage || !pattern) return;
    const { gauge: _old, ...base } = project;
    const gauge = change.gauge === undefined ? project.gauge : change.gauge;
    const updated: StoredProject = {
      ...base,
      ...(gauge ? { gauge } : {}),
      name: change.name?.trim() ? change.name.trim().slice(0, 120) : project.name,
      updatedAt: new Date().toISOString(),
    };
    set({ project: updated });
    saveProject(updated, () => set({ saveFailed: true }));
    await Promise.resolve();
  },
}));

/** Wait until queued writes are stored (tests, page hide). */
export const flushWrites = (): Promise<unknown> => writeQueue;
