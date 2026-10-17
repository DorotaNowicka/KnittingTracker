import { create } from 'zustand';

/** A waiting service-worker update. Applying it reloads the app, so it is never done silently (ADR-3). */
export const useUpdate = create<{ apply: (() => void) | null }>(() => ({ apply: null }));

export function announceUpdate(apply: () => void): void {
  useUpdate.setState({ apply });
}
