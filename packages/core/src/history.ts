/**
 * A bounded undo/redo history of immutable snapshots (editor sessions). Pure: every function
 * returns a new history.
 */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  readonly limit: number;
}

export const EDITOR_HISTORY_LIMIT = 200;

export function createHistory<T>(present: T, limit = EDITOR_HISTORY_LIMIT): History<T> {
  return { past: [], present, future: [], limit: Math.max(1, limit) };
}

/** Record a new state. Equal states (by `same`) are not recorded twice. */
export function pushHistory<T>(
  h: History<T>,
  next: T,
  same: (a: T, b: T) => boolean = Object.is,
): History<T> {
  if (same(h.present, next)) return h;
  const past = [...h.past, h.present];
  return { ...h, past: past.slice(Math.max(0, past.length - h.limit)), present: next, future: [] };
}

/** Replace the present state without a history entry (e.g. while a drag is in progress). */
export function replacePresent<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

export function undoHistory<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { ...h, past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redoHistory<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { ...h, past: [...h.past, h.present], present: next, future: rest };
}
