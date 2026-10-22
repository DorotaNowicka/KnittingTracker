import type { StorageAdapter, StoredProgress, StoredProject } from './types';

const key = (projectId: string, patternId: string) => `${projectId}\u0000${patternId}`;

/** In-memory storage: used when IndexedDB is unavailable. Nothing survives a reload. */
export function createMemoryStorage(): StorageAdapter {
  const projects = new Map<string, StoredProject>();
  const progress = new Map<string, StoredProgress>();
  const settings = new Map<string, unknown>();
  return {
    kind: 'memory',
    listProjects: async () => [...projects.values()],
    getProject: async (id) => projects.get(id),
    putProject: async (p) => void projects.set(p.id, p),
    deleteProject: async (id) => {
      projects.delete(id);
      for (const [k, v] of progress) if (v.projectId === id) progress.delete(k);
    },
    getProgress: async (projectId, patternId) => progress.get(key(projectId, patternId)),
    listProgress: async (projectId) =>
      [...progress.values()].filter((p) => projectId === undefined || p.projectId === projectId),
    putProgress: async (p) => void progress.set(key(p.projectId, p.patternId), p),
    deleteProgress: async (projectId, patternId) => void progress.delete(key(projectId, patternId)),
    getSetting: async <T>(k: string) => settings.get(k) as T | undefined,
    setSetting: async (k, v) => void settings.set(k, v),
  };
}
