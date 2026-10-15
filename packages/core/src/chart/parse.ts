import { diagnostic, type Diagnostic } from '../basics';
import { CONTINUATION, type Chart } from '../schema/pattern';
import { STD } from '../symbols/library';
import type { SymbolRegistry } from '../symbols/registry';
import type { SymbolDef } from '../symbols/types';

/** One chart cell after parsing: which symbol covers it and which part of the symbol it is. */
export interface ChartCell {
  readonly symbolId: string;
  /** 1-based chart column of the symbol's leftmost cell. */
  readonly anchorCol: number;
  /** 0 for the anchor (leftmost) cell, 1…width-1 for continuation cells. */
  readonly part: number;
  readonly width: number;
}

export interface ParsedChart {
  readonly chart: Chart;
  /** cells[row-1][col-1]; row 1 is the bottom row. Always height × width, even when invalid. */
  readonly cells: readonly (readonly ChartCell[])[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Parse the compact row strings of a chart into cells. Problems never throw: they become
 * diagnostics and the affected cells fall back to plain knit, so the grid can still be shown and
 * fixed in the editor.
 */
export function parseChart(chart: Chart, registry: SymbolRegistry): ParsedChart {
  const diags: Diagnostic[] = [];
  const where = { chartId: chart.id };
  const fallback = registry.require(STD.knit);

  if (chart.rows.length !== chart.height) {
    diags.push(
      diagnostic(
        'chart-height',
        'error',
        `Chart ${chart.name} declares ${chart.height} rows but has ${chart.rows.length}.`,
        where,
      ),
    );
  }
  for (const [key, symbolId] of Object.entries(chart.palette)) {
    if (key === CONTINUATION) {
      diags.push(
        diagnostic(
          'palette-reserved',
          'error',
          `"${CONTINUATION}" is reserved for continuation cells.`,
          where,
        ),
      );
    } else if (!registry.has(symbolId)) {
      diags.push(
        diagnostic(
          'palette-unknown-symbol',
          'error',
          `Unknown symbol "${symbolId}" for "${key}".`,
          where,
        ),
      );
    }
  }

  const cells: ChartCell[][] = [];
  for (let r = 1; r <= chart.height; r++) {
    const source = Array.from(chart.rows[r - 1] ?? '');
    const at = { ...where, row: r };
    if (source.length !== chart.width) {
      diags.push(
        diagnostic(
          'row-width',
          'error',
          `Row ${r} of ${chart.name} has ${source.length} cells, expected ${chart.width}.`,
          at,
        ),
      );
    }
    const row: ChartCell[] = [];
    let open: { def: SymbolDef; anchorCol: number; next: number } | null = null;

    const closeOpen = (col: number) => {
      if (open && open.next < open.def.width) {
        diags.push(
          diagnostic(
            'symbol-truncated',
            'error',
            `Symbol ${open.def.id} at column ${open.anchorCol} needs ${open.def.width} cells but has ${open.next}.`,
            { ...at, col },
          ),
        );
      }
      open = null;
    };

    for (let c = 1; c <= chart.width; c++) {
      const ch = source[c - 1];
      if (ch === CONTINUATION) {
        if (open && open.next < open.def.width) {
          row.push({
            symbolId: open.def.id,
            anchorCol: open.anchorCol,
            part: open.next,
            width: open.def.width,
          });
          open.next += 1;
          continue;
        }
        diags.push(
          diagnostic(
            'orphan-continuation',
            'error',
            `Continuation cell without a symbol to extend.`,
            { ...at, col: c },
          ),
        );
        row.push({ symbolId: fallback.id, anchorCol: c, part: 0, width: 1 });
        continue;
      }
      closeOpen(c - 1);
      const symbolId = ch === undefined ? undefined : chart.palette[ch];
      const def = symbolId === undefined ? undefined : registry.get(symbolId);
      if (!def) {
        if (ch !== undefined) {
          diags.push(
            diagnostic('unknown-cell', 'error', `Character "${ch}" is not in the palette.`, {
              ...at,
              col: c,
            }),
          );
        }
        row.push({ symbolId: fallback.id, anchorCol: c, part: 0, width: 1 });
        continue;
      }
      row.push({ symbolId: def.id, anchorCol: c, part: 0, width: def.width });
      if (def.width > 1) {
        if (c + def.width - 1 > chart.width) {
          diags.push(
            diagnostic(
              'symbol-overflow',
              'error',
              `Symbol ${def.id} at column ${c} extends past the chart edge.`,
              { ...at, col: c },
            ),
          );
        }
        open = { def, anchorCol: c, next: 1 };
      }
    }
    closeOpen(chart.width);
    cells.push(row);
  }
  return { chart, cells, diagnostics: diags };
}

/** Cell lookup with bounds checking. */
export function chartCell(parsed: ParsedChart, row: number, col: number): ChartCell {
  const cell = parsed.cells[row - 1]?.[col - 1];
  if (!cell) throw new RangeError(`Cell (${row}, ${col}) is outside chart ${parsed.chart.name}`);
  return cell;
}

/** Build a chart from rows given as arrays of symbol ids (helper for editors, importers and tests). */
export function chartFromSymbolRows(
  base: Pick<Chart, 'id' | 'name'>,
  rows: readonly (readonly (string | typeof CONTINUATION)[])[],
): Chart {
  const palette: Record<string, string> = {};
  const keyOf = new Map<string, string>();
  const alphabet = 'kpabcdefghijlmnoqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const nextKey = (symbolId: string): string => {
    const existing = keyOf.get(symbolId);
    if (existing) return existing;
    const preferred = symbolId === STD.knit ? 'k' : symbolId === STD.purl ? 'p' : undefined;
    const key = preferred ?? [...alphabet].find((k) => !(k in palette) && k !== 'k' && k !== 'p');
    if (!key) throw new Error('Too many distinct symbols for one chart');
    palette[key] = symbolId;
    keyOf.set(symbolId, key);
    return key;
  };
  const strings = rows.map((row) =>
    row.map((s) => (s === CONTINUATION ? CONTINUATION : nextKey(s))).join(''),
  );
  return {
    ...base,
    width: rows[0]?.length ?? 0,
    height: rows.length,
    palette,
    rows: strings,
  };
}
