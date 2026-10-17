import type { StorageAdapter, StoredPattern, StoredProgress, StoredProject } from './types';

const key = (projectId: string, stageId: string) => `${projectId}\u0000${stageId}`;

/** In-memory storage: used when IndexedDB is unavailable. Nothing survives a reload. */
export function createMemoryStorage(): StorageAdapter {
  const patterns = new Map<string, StoredPattern>();
  const projects = new Map<string, StoredProject>();
  const progress = new Map<string, StoredProgress>();
  const settings = new Map<string, unknown>();
  return {
    kind: 'memory',
    listPatterns: async () => [...patterns.values()],
    getPattern: async (id) => patterns.get(id),
    putPattern: async (p) => void patterns.set(p.id, p),
    deletePattern: async (id) => void patterns.delete(id),
    listProjects: async () => [...projects.values()],
    getProject: async (id) => projects.get(id),
    putProject: async (p) => void projects.set(p.id, p),
    deleteProject: async (id) => {
      projects.delete(id);
      for (const [k, v] of progress) if (v.projectId === id) progress.delete(k);
    },
    getProgress: async (projectId, stageId) => progress.get(key(projectId, stageId)),
    listProgress: async (projectId) =>
      [...progress.values()].filter((p) => projectId === undefined || p.projectId === projectId),
    putProgress: async (p) => void progress.set(key(p.projectId, p.stageId), p),
    getSetting: async <T>(k: string) => settings.get(k) as T | undefined,
    setSetting: async (k, v) => void settings.set(k, v),
  };
}
