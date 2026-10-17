import {
  lastDone,
  nextStitch,
  type ParsedChart,
  type ResolvedStage,
  type RowModel,
  type SymbolRegistry,
} from '@kt/core';
import type { Band, GridCell, GridSource } from './geometry';
import type { Overlay } from './scene';

/** Rows to draw for a stage: the planned rows, or enough for open-ended stages. */
export function visibleRowCount(
  stage: ResolvedStage,
  currentRow: number,
  requested: number | 'stageEnd',
): number {
  const tallest = Math.max(1, ...stage.zones.map((z) => z.chart.chart.height));
  if (requested !== 'stageEnd') return Math.max(1, Math.floor(requested));
  if (stage.plannedRows !== null) return stage.plannedRows;
  // Open-ended: everything up to the current row plus one full repeat of the tallest chart,
  // rounded up to whole repeats so no chart looks cut off.
  return Math.ceil((currentRow + tallest) / tallest) * tallest;
}

/** Adapt a resolved stage from `@kt/core` to the renderer's {@link GridSource}. */
export function stageSource(stage: ResolvedStage, rows: number): GridSource {
  const n = stage.stitchCount;
  const toCol = (stitch: number) => n - stitch + 1;
  const zones: Band[] = stage.zones.map((z) => ({
    label: z.label,
    firstCol: z.firstCol,
    lastCol: z.lastCol,
  }));
  const sections: Band[] = stage.sections
    .map((s) => ({ label: s.name, firstCol: toCol(s.lastStitch), lastCol: toCol(s.firstStitch) }))
    .sort((a, b) => a.firstCol - b.firstCol);
  const cache = new Map<number, GridCell>();
  return {
    cols: n,
    rows,
    zones,
    sections,
    continuesAbove: stage.plannedRows === null || stage.plannedRows > rows,
    stitchNumber: (col) => n - col + 1,
    cell(row, col) {
      const key = row * 100_003 + col;
      let cell = cache.get(key);
      if (!cell) {
        const c = stage.cellAtCol(row, col);
        const def = stage.symbol(c);
        cell = { glyph: def.glyph, width: c.width, part: c.part, noStitch: !def.worked };
        if (cache.size > 200_000) cache.clear();
        cache.set(key, cell);
      }
      return cell;
    },
  };
}

/**
 * Adapt a single chart (chart editor): one zone, columns numbered from the right like the stitches
 * of an RS row. Unknown symbols are drawn as knit so a broken chart can still be fixed.
 */
export function chartSource(parsed: ParsedChart, registry: SymbolRegistry): GridSource {
  const { width, height, name } = parsed.chart;
  return {
    cols: width,
    rows: height,
    zones: [{ label: name, firstCol: 1, lastCol: width }],
    sections: [],
    continuesAbove: false,
    stitchNumber: (col) => width - col + 1,
    cell(row, col) {
      const c = parsed.cells[row - 1]?.[col - 1];
      const def = (c && registry.get(c.symbolId)) ?? registry.require('std:k');
      return {
        glyph: def.glyph,
        width: c?.width ?? 1,
        part: c?.part ?? 0,
        noStitch: !def.worked,
      };
    },
  };
}

/** An overlay without progress, for editing. */
export function editorOverlay(options: {
  readonly cursor?: { readonly row: number; readonly col: number } | null;
  readonly selection?: Overlay['selection'];
  readonly highlights?: Overlay['highlights'];
}): Overlay {
  return {
    done: () => null,
    currentRow: null,
    direction: 'right-to-left',
    marker: null,
    cursor: options.cursor ?? null,
    veilAbove: false,
    staticKey: 'editor',
    selection: options.selection ?? null,
    highlights: options.highlights ?? [],
  };
}

export interface OverlayOptions {
  readonly cursor?: { readonly row: number; readonly col: number } | null;
  readonly veilAbove?: boolean;
}

/** Build the progress overlay for `done` completed cells. */
export function progressOverlay(
  model: RowModel,
  done: number,
  options: OverlayOptions = {},
): Overlay {
  const last = lastDone(model, done);
  const next = nextStitch(model, done);
  const currentRow = next?.row ?? null;
  const n = model.stage.stitchCount;
  let partial: { fromCol: number; toCol: number } | null = null;
  if (next && next.work > 1) {
    const order = model.workOrder(next.row).slice(0, next.work - 1);
    const cols = order.map((s) => n - s + 1);
    partial = { fromCol: Math.min(...cols), toCol: Math.max(...cols) };
  }
  return {
    done(row) {
      if (currentRow === null) return last && row <= last.row ? 'all' : null;
      if (row < currentRow) return 'all';
      return row === currentRow ? partial : null;
    },
    currentRow,
    direction: next && next.side === 'WS' ? 'left-to-right' : 'right-to-left',
    // A row counter has no "last stitch" to point at.
    marker: last && model.unit === 'stitch' ? { row: last.row, col: last.col } : null,
    cursor: options.cursor ?? null,
    veilAbove: options.veilAbove ?? true,
    staticKey: String(done),
  };
}
