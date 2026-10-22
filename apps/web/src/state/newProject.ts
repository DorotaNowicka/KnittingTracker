import { create } from 'zustand';

/** What was typed on the "new project" screen, kept while choosing the kind on the next one. */
export const useNewProject = create<{ name: string; setName(name: string): void }>((set) => ({
  name: '',
  setName: (name) => set({ name }),
}));
