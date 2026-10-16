import {
  createRowModel,
  initialProgress,
  reduceProgress,
  resolveStage,
  type Pattern,
  type ProgressAction,
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
  });
  return { stage, model: createRowModel(stage) };
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
      undo: next.undo,
      redo: next.redo,
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
    const storage = await getStorage();
    await storage.putProject(updated).catch(() => set({ saveFailed: true }));
    useLibrary.getState().touchProject(updated);
  },
}));

/** Wait until queued writes are stored (tests, page hide). */
export const flushWrites = (): Promise<unknown> => writeQueue;
