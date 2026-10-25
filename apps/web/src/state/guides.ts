import { create } from 'zustand';
import { getGuidesPref, setGuidesPref } from '../lib/preferences';

/** Whether the grids (tracker and creator) show guide lines at the quarters; kept per device. */
interface GuidesState {
  readonly on: boolean;
  toggle(): void;
}

export const useGuides = create<GuidesState>((set, get) => ({
  on: getGuidesPref(),
  toggle() {
    const on = !get().on;
    setGuidesPref(on);
    set({ on });
  },
}));
