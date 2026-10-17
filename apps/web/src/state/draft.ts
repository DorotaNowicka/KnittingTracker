import { patternSchema, type Pattern } from '@kt/core';
import { create } from 'zustand';
import type { StoredPattern } from '../lib/storage';
import { getStorage, useLibrary } from './library';

/**
 * The pattern open in the editor (M3). Every change is applied in memory at once and written to
 * storage shortly after (debounced), so typing and painting stay fast. A pattern is only written
 * when it passes the file schema: storage never holds a pattern that could not be exported or
 * read back.
 */
interface DraftState {
  readonly status: 'idle' | 'loading' | 'ready' | 'missing';
  readonly id: string | null;
  readonly stored: StoredPattern | null;
  readonly pattern: Pattern | null;
  /** Unsaved changes are pending. */
  readonly dirty: boolean;
  readonly saveError: boolean;
  open(id: string): Promise<void>;
  update(change: (pattern: Pattern) => Pattern): void;
  flush(): Promise<void>;
}

export const SAVE_DELAY_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
/** Revision is bumped once per editing session, on the first change. */
let bumped = false;
let saving: Promise<void> = Promise.resolve();

export const useDraft = create<DraftState>((set, get) => ({
  status: 'idle',
  id: null,
  stored: null,
  pattern: null,
  dirty: false,
  saveError: false,

  async open(id) {
    const current = get();
    if (current.id === id && current.status === 'ready') return;
    await get().flush();
    bumped = false;
    set({ status: 'loading', id, stored: null, pattern: null, dirty: false, saveError: false });
    const fromLibrary = useLibrary.getState().patterns.find((p) => p.id === id);
    const stored = fromLibrary ?? (await (await getStorage()).getPattern(id));
    if (get().id !== id) return;
    if (!stored) return set({ status: 'missing' });
    set({ status: 'ready', stored, pattern: stored.pattern });
  },

  update(change) {
    const { pattern, stored } = get();
    if (!pattern || !stored) return;
    let next = change(pattern);
    if (next === pattern) return;
    if (!bumped) {
      bumped = true;
      next = { ...next, revision: stored.pattern.revision + 1 };
    }
    set({ pattern: next, dirty: true });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), SAVE_DELAY_MS);
  },

  async flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const run = async () => {
      const { pattern, stored, dirty } = get();
      if (!pattern || !stored || !dirty) return;
      if (!patternSchema.safeParse(pattern).success) {
        console.error('[draft] refusing to save a pattern that fails the schema');
        set({ saveError: true });
        return;
      }
      const next: StoredPattern = { ...stored, pattern, updatedAt: new Date().toISOString() };
      try {
        await useLibrary.getState().updatePattern(next);
        // Only clear `dirty` if nothing changed while writing.
        set(
          get().pattern === pattern
            ? { stored: next, dirty: false, saveError: false }
            : { stored: next },
        );
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
  saving = Promise.resolve();
  useDraft.setState({
    status: 'idle',
    id: null,
    stored: null,
    pattern: null,
    dirty: false,
    saveError: false,
  });
}
