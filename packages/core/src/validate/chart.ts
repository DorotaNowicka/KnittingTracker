import { diagnostic, type Diagnostic } from '../basics';
import type { ParsedChart } from '../chart/parse';
import type { SymbolRegistry } from '../symbols/registry';
import type { StitchKind, SymbolDef } from '../symbols/types';

/** Per symbol instance in a chart row (anchors only). */
function anchors(parsed: ParsedChart, row: number, registry: SymbolRegistry): SymbolDef[] {
  const cells = parsed.cells[row - 1] ?? [];
  return cells.filter((c) => c.part === 0).map((c) => registry.require(c.symbolId));
}

export const consumedInRow = (parsed: ParsedChart, row: number, registry: SymbolRegistry) =>
  anchors(parsed, row, registry).reduce((sum, s) => sum + s.consumes, 0);

export const producedInRow = (parsed: ParsedChart, row: number, registry: SymbolRegistry) =>
  anchors(parsed, row, registry).reduce((sum, s) => sum + s.produces, 0);

/**
 * Stitch-count chain (corrects G1 of the analysis): what row r produces must equal what row r+1
 * consumes. "consumed = produced" inside one row only holds for rows without shaping, so it is not
 * required. The wrap from the top row back to row 1 is checked separately: if it fails, the chart
 * can't be repeated vertically as is.
 */
export function checkStitchChain(parsed: ParsedChart, registry: SymbolRegistry): Diagnostic[] {
  const out: Diagnostic[] = [];
  const { id, name, height } = parsed.chart;
  for (let r = 1; r <= height; r++) {
    const produced = producedInRow(parsed, r, registry);
    const nextRow = r === height ? 1 : r + 1;
    const consumed = consumedInRow(parsed, nextRow, registry);
    if (produced === consumed) continue;
    if (r === height) {
      out.push(
        diagnostic(
          'chain-wrap',
          'warning',
          `${name}: the top row leaves ${produced} stitches but row 1 needs ${consumed}; the chart can't repeat vertically as is.`,
          { chartId: id, row: 1 },
        ),
      );
    } else {
      out.push(
        diagnostic(
          'chain-break',
          'error',
          `${name}: row ${r} leaves ${produced} stitches but row ${nextRow} needs ${consumed}.`,
          { chartId: id, row: nextRow },
        ),
      );
    }
  }
  return out;
}

/** Knit/purl kinds per column flowing out of / into a row; null where unknown or misaligned. */
function columnKinds(
  parsed: ParsedChart,
  row: number,
  registry: SymbolRegistry,
  side: 'in' | 'out',
): (StitchKind | null)[] | null {
  const cells = parsed.cells[row - 1] ?? [];
  const kinds: (StitchKind | null)[] = [];
  for (const cell of cells) {
    const s = registry.require(cell.symbolId);
    // Shaping or "no stitch" cells shift stitches between columns: flow is undefined for the row.
    if (s.consumes !== s.width || s.produces !== s.width || !s.worked) return null;
    kinds.push(s.flow ? (s.flow[side][cell.part] ?? null) : null);
  }
  return kinds;
}

/**
 * Stitch-flow lint: stitches keep their kind as they travel up, so the stitch kinds entering row
 * r+1 should match those leaving row r column by column.
 * - A mismatch at a **cable** input is a `warning` (probably a misread chart cell).
 * - A mismatch at a plain knit/purl cell is `info`: usually an intended texture change
 *   (e.g. a purl ridge), but useful to highlight during import verification.
 */
export function checkStitchFlow(
  parsed: ParsedChart,
  registry: SymbolRegistry,
  wrap = true,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const { id, name, height } = parsed.chart;
  const last = wrap ? height : height - 1;
  for (let r = 1; r <= last; r++) {
    const nextRow = r === height ? 1 : r + 1;
    const below = columnKinds(parsed, r, registry, 'out');
    const above = columnKinds(parsed, nextRow, registry, 'in');
    if (!below || !above) continue;
    const cells = parsed.cells[nextRow - 1] ?? [];
    for (let c = 0; c < above.length; c++) {
      const a = above[c];
      const b = below[c];
      if (!a || !b || a === b) continue;
      const cell = cells[c];
      const isCable = cell ? registry.require(cell.symbolId).family === 'cable' : false;
      out.push(
        diagnostic(
          isCable ? 'flow-cable' : 'flow-texture',
          isCable ? 'warning' : 'info',
          isCable
            ? `${name}: the cable in row ${nextRow}, column ${c + 1} expects a ${a === 'k' ? 'knit' : 'purl'} stitch but row ${r} leaves a ${b === 'k' ? 'knit' : 'purl'} one.`
            : `${name}: texture changes from ${b} to ${a} at row ${nextRow}, column ${c + 1}.`,
          { chartId: id, row: nextRow, col: c + 1 },
        ),
      );
    }
  }
  return out;
}

/** All chart-level checks: structure (from parsing), stitch chain and stitch flow. */
export function validateChart(parsed: ParsedChart, registry: SymbolRegistry): Diagnostic[] {
  return [
    ...parsed.diagnostics,
    ...checkStitchChain(parsed, registry),
    ...checkStitchFlow(parsed, registry),
  ];
}
