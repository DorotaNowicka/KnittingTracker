import { parseMotifs, type Chart } from '@kt/core';
import { create } from 'zustand';
import { getStorage } from './library';

/** Settings key of the knitter's own pieces of pattern. */
const KEY = 'motifs';

/**
 * The knitter's own pieces of pattern (ids `own:…`), drawn once in the pattern creator and offered
 * in every project. Kept on this device with the other settings.
 */
interface MotifsState {
  readonly status: 'idle' | 'loading' | 'ready';
  readonly motifs: readonly Chart[];
  load(): Promise<void>;
  /** Add a piece or replace the one with the same id. */
  save(motif: Chart): Promise<void>;
  remove(id: string): Promise<void>;
}

const write = async (motifs: readonly Chart[]) => {
  const storage = await getStorage();
  await storage.setSetting(KEY, motifs);
};

export const useMotifs = create<MotifsState>((set, get) => ({
  status: 'idle',
  motifs: [],

  async load() {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    const storage = await getStorage();
    const raw = await storage.getSetting<unknown>(KEY).catch(() => undefined);
    set({ status: 'ready', motifs: parseMotifs(raw) });
  },

  async save(motif) {
    await get().load();
    const motifs = get().motifs.some((m) => m.id === motif.id)
      ? get().motifs.map((m) => (m.id === motif.id ? motif : m))
      : [...get().motifs, motif];
    set({ motifs });
    await write(motifs);
  },

  async remove(id) {
    const motifs = get().motifs.filter((m) => m.id !== id);
    set({ motifs });
    await write(motifs);
  },
}));
