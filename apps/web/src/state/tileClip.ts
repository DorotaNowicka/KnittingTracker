import { create } from 'zustand';
import type { Clip } from '../designer/designOps';

/** Tiles copied in the pattern creator (Ctrl+C), ready to paste in any part (Ctrl+V). */
interface TileClipState {
  readonly clip: Clip | null;
  set(clip: Clip | null): void;
}

export const useTileClip = create<TileClipState>((set) => ({
  clip: null,
  set: (clip) => set({ clip }),
}));
