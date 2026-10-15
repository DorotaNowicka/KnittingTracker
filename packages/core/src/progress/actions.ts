import { nextStitch, type RowModel } from './position';

/** Undo/redo depth kept with the state (spec: ≥ 300). */
export const HISTORY_LIMIT = 500;

export interface ProgressState {
  readonly done: number;
  readonly undo: readonly number[];
  readonly redo: readonly number[];
}

export const initialProgress: ProgressState = { done: 0, undo: [], redo: [] };

export type TapMode = 'mark' | 'erase';

export type ProgressAction =
  /** Tap the stitch with global index `index` (see `indexOfStitch`). */
  | { readonly type: 'tap'; readonly index: number; readonly mode: TapMode }
  /** Finish the row being worked (or the next row if the current one is already complete). */
  | { readonly type: 'completeRow' }
  /** Jump to an explicit position (manual entry, DR-8). */
  | { readonly type: 'set'; readonly done: number }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

function clamp(model: RowModel, done: number): number {
  const total = model.total();
  const d = Math.max(0, Math.floor(done));
  return total === null ? d : Math.min(d, total);
}

/** Record a change: push the old value on the undo stack (bounded) and clear redo. */
function commit(state: ProgressState, done: number): ProgressState {
  if (done === state.done) return state;
  const undo = [...state.undo, state.done];
  if (undo.length > HISTORY_LIMIT) undo.splice(0, undo.length - HISTORY_LIMIT);
  return { done, undo, redo: [] };
}

/**
 * Pure progress reducer.
 *
 * - **mark**: tapping a not-yet-done stitch marks it and everything before it. Tapping a done stitch
 *   does nothing (an accidental tap must never lose work).
 * - **erase**: tapping a done stitch makes it the last done one (as in the prototype). Tapping the
 *   last done stitch itself un-marks it. Tapping a not-done stitch does nothing.
 * - **completeRow**: moves to the end of the row of the next stitch.
 * - Every change is undoable; a no-op returns the same state object.
 */
export function reduceProgress(
  state: ProgressState,
  action: ProgressAction,
  model: RowModel,
): ProgressState {
  switch (action.type) {
    case 'tap': {
      const i = action.index;
      if (!Number.isInteger(i) || i < 1) return state;
      if (action.mode === 'mark') return i > state.done ? commit(state, clamp(model, i)) : state;
      if (i < state.done) return commit(state, i);
      if (i === state.done) return commit(state, i - 1);
      return state;
    }
    case 'completeRow': {
      const next = nextStitch(model, state.done);
      if (!next) return state;
      return commit(state, clamp(model, model.rowStart(next.row) + model.rowLength(next.row)));
    }
    case 'set':
      return commit(state, clamp(model, action.done));
    case 'undo': {
      const prev = state.undo.at(-1);
      if (prev === undefined) return state;
      return { done: prev, undo: state.undo.slice(0, -1), redo: [...state.redo, state.done] };
    }
    case 'redo': {
      const next = state.redo.at(-1);
      if (next === undefined) return state;
      return {
        done: next,
        undo: [...state.undo, state.done].slice(-HISTORY_LIMIT),
        redo: state.redo.slice(0, -1),
      };
    }
  }
}

export const canUndo = (s: ProgressState) => s.undo.length > 0;
export const canRedo = (s: ProgressState) => s.redo.length > 0;
