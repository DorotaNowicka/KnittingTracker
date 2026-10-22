import type { ResolvedPattern, Side } from '../layout/resolve';
import { wsSymbolId } from '../symbols/registry';

/**
 * One run of identical instructions in work order, e.g. "p × 6" or one cable crossing.
 * On WS rows the symbol is already translated to what is actually worked (knit ↔ purl…).
 */
export interface InstructionToken {
  /** Symbol to work (after WS translation). */
  readonly symbolId: string;
  /** Symbol as drawn in the chart. */
  readonly chartSymbolId: string;
  /** Number of repetitions (multi-cell symbols count once per crossing). */
  readonly count: number;
  /** Stitch range covered, in RS stitch numbers (first worked → last worked). */
  readonly fromStitch: number;
  readonly toStitch: number;
  /** Set when the symbol has no valid WS form (validation error in flat patterns). */
  readonly problem?: 'ws-unsupported';
  /** WS-specific instruction text for `explicit` symbols. */
  readonly wsText?: { readonly pl: string; readonly en: string };
}

export interface RowInstructions {
  readonly row: number;
  readonly side: Side;
  /** Reading direction in the RS view. */
  readonly direction: 'right-to-left' | 'left-to-right';
  readonly tokens: readonly InstructionToken[];
}

/**
 * Text form of one pattern row (DR-12): the cells in work order, merged into runs. Used by the
 * "current row" panel and as the screen-reader view of the canvas grid.
 */
export function rowInstructions(grid: ResolvedPattern, row: number): RowInstructions {
  const side = grid.side(row);
  const rs = side === 'RS';
  const n = grid.stitchCount;
  const tokens: InstructionToken[] = [];

  for (let i = 1; i <= n;) {
    const stitch = rs ? i : n - i + 1;
    const cell = grid.cellAtStitch(row, stitch);
    const def = grid.symbol(cell);
    // A multi-cell symbol is one instruction: skip its remaining cells in work order. RS rows meet
    // a symbol at its rightmost cell, WS rows at its leftmost one.
    const span = rs ? cell.part + 1 : def.width - cell.part;
    const lastStitch = rs ? stitch + span - 1 : stitch - span + 1;
    i += span;
    if (!def.worked) continue;

    let symbolId = def.id;
    let problem: InstructionToken['problem'];
    let wsText: InstructionToken['wsText'];
    if (!rs) {
      const ws = wsSymbolId(def);
      if (ws === undefined) problem = 'ws-unsupported';
      else symbolId = ws;
      if (def.ws.mode === 'explicit') wsText = def.ws.text;
    }

    const prev = tokens.at(-1);
    if (prev && prev.chartSymbolId === def.id && prev.problem === problem) {
      tokens[tokens.length - 1] = { ...prev, count: prev.count + 1, toStitch: lastStitch };
      continue;
    }
    tokens.push({
      symbolId,
      chartSymbolId: def.id,
      count: 1,
      fromStitch: stitch,
      toStitch: lastStitch,
      ...(problem ? { problem } : {}),
      ...(wsText ? { wsText } : {}),
    });
  }
  return { row, side, direction: rs ? 'right-to-left' : 'left-to-right', tokens };
}
