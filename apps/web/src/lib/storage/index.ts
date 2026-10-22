import { createIdbStorage } from './idb';
import { createMemoryStorage } from './memory';
import type { StorageAdapter } from './types';

export type { StorageAdapter, StoredProgress, StoredProject } from './types';
export { createMemoryStorage } from './memory';

/**
 * Open the best available storage. IndexedDB can fail (private browsing, blocked site data,
 * quota): the app then keeps working in memory and shows a permanent warning (FR-19).
 */
export async function openStorage(): Promise<StorageAdapter> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
    return await createIdbStorage();
  } catch (error) {
    console.warn('[storage] falling back to memory:', error);
    return createMemoryStorage();
  }
}

export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

/** Ask the browser to keep our data even under storage pressure (ADR-3). Never throws. */
export async function requestPersistence(): Promise<PersistState> {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

export async function persistenceState(): Promise<PersistState> {
  try {
    if (!navigator.storage?.persisted) return 'unsupported';
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}
