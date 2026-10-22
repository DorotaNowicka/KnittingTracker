import { mapPattern, projectSchema, type Pattern, type Project } from '@kt/core';
import { create } from 'zustand';
import type { StoredProject } from '../lib/storage';
import { getStorage, useLibrary } from './library';

/**
 * The project open in the editors (project page, pattern page, chart editor). Every change is
 * applied in memory at once and written shortly after (debounced), so typing and painting stay
 * fast. A project is only written when it passes the schema: storage never holds a project that
 * could not be exported or read back.
 *
 * Writing merges into the library's latest copy: only the top-level fields this draft changed
 * since it was loaded are taken, so a change the tracker made meanwhile (e.g. the active pattern
 * or finished rows) is never overwritten by a stale copy.
 */
interface DraftState {
  readonly status: 'idle' | 'loading' | 'ready' | 'missing';
  readonly id: string | null;
  readonly project: Project | null;
  /** Unsaved changes are pending. */
  readonly dirty: boolean;
  readonly saveError: boolean;
  open(id: string): Promise<void>;
  update(change: (project: Project) => Project): void;
  /** Change one pattern of the open project. */
  updatePattern(patternId: string, change: (pattern: Pattern) => Pattern): void;
  flush(): Promise<void>;
}

export const SAVE_DELAY_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
/** Revision is bumped once per editing session, on the first change. */
let bumped = false;
let saving: Promise<void> = Promise.resolve();
/** The project as last loaded or saved: the base of the three-way merge. */
let base: Project | null = null;

/** Fields of `draft` that differ from `from` (by reference), applied onto `latest`. */
function merge(latest: StoredProject, from: Project, draft: Project): StoredProject {
  const before = from as Record<string, unknown>;
  const after = draft as Record<string, unknown>;
  const changed = new Set(
    [...Object.keys(from), ...Object.keys(draft)].filter((key) => before[key] !== after[key]),
  );
  // Keys the draft changed come from the draft (or are dropped when it removed them).
  const kept = Object.entries(latest).filter(([key]) => !changed.has(key));
  const taken = Object.entries(draft).filter(([key]) => changed.has(key));
  return Object.fromEntries([...kept, ...taken]) as StoredProject;
}

export const useDraft = create<DraftState>((set, get) => ({
  status: 'idle',
  id: null,
  project: null,
  dirty: false,
  saveError: false,

  async open(id) {
    const current = get();
    if (current.id === id && current.status === 'ready' && current.dirty) return;
    await get().flush();
    if (current.id !== id) bumped = false;
    if (current.id !== id) set({ status: 'loading', id, project: null, saveError: false });
    const fromLibrary = useLibrary.getState().project(id);
    const stored = fromLibrary ?? (await (await getStorage()).getProject(id));
    if (get().id !== id) return;
    if (!stored) {
      base = null;
      return set({ status: 'missing', project: null });
    }
    base = stored;
    set({ status: 'ready', project: stored, dirty: false });
  },

  update(change) {
    const { project } = get();
    if (!project || !base) return;
    let next = change(project);
    if (next === project) return;
    if (!bumped) {
      bumped = true;
      next = { ...next, revision: base.revision + 1 };
    }
    set({ project: next, dirty: true });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), SAVE_DELAY_MS);
  },

  updatePattern(patternId, change) {
    get().update((p) => mapPattern(p, patternId, change));
  },

  async flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const run = async () => {
      const { project, dirty, id } = get();
      const from = base;
      if (!project || !from || !dirty || !id) return;
      if (!projectSchema.safeParse(project).success) {
        console.error('[draft] refusing to save a project that fails the schema');
        set({ saveError: true });
        return;
      }
      const now = new Date().toISOString();
      try {
        const saved = await useLibrary
          .getState()
          .updateProject(id, (latest) => ({ ...merge(latest, from, project), updatedAt: now }));
        if (!saved) throw new Error('the project is gone');
        if (get().project === project) {
          // Nothing changed while writing: continue from the merged copy.
          base = saved;
          set({ project: saved, dirty: false, saveError: false });
        } else {
          // Edits came in while writing: the next merge compares against what was written.
          base = project;
        }
      } catch (error) {
        console.error('[draft] save failed', error);
        set({ saveError: true });
      }
    };
    saving = saving.then(run, run);
    return saving;
  },
}));

if (typeof document !== 'undefined') {
  // Leaving the page (or app switch on a phone): write pending edits now.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void useDraft.getState().flush();
  });
}

/** Test helper: forget the open draft. */
export function resetDraftForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  bumped = false;
  base = null;
  saving = Promise.resolve();
  useDraft.setState({ status: 'idle', id: null, project: null, dirty: false, saveError: false });
}
