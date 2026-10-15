import { diagnostic, lcm, type Diagnostic } from '../basics';
import type { ResolvedStage, Zone } from '../layout/resolve';

/**
 * A partial horizontal repeat must not cut through a multi-cell symbol: a cable that is half
 * inside a zone can't be knitted. Checked for every chart row.
 */
export function checkZoneEdges(stage: ResolvedStage): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const zone of stage.zones) {
    const h = zone.chart.chart.height;
    for (let chartRow = 1; chartRow <= h; chartRow++) {
      // Stage row whose chart row is `chartRow` for this zone.
      const row = chartRow - zone.rowOffset + h * Math.ceil((zone.rowOffset + 1) / h);
      for (let stitch = zone.firstStitch; stitch <= zone.lastStitch; stitch++) {
        const cell = stage.cellAtStitch(row, stitch);
        if (cell.width === 1) continue;
        // Display columns of the whole symbol must stay inside the zone and form one symbol.
        const anchorCol = cell.col - cell.part;
        const endCol = anchorCol + cell.width - 1;
        if (
          anchorCol < zone.firstCol ||
          endCol > zone.lastCol ||
          !sameSymbol(stage, zone, row, anchorCol, cell.anchorCol)
        ) {
          out.push(
            diagnostic(
              'zone-cuts-symbol',
              'error',
              `${zone.label}: the repeat over ${zone.lastStitch - zone.firstStitch + 1} stitches cuts a ${cell.width}-cell symbol (chart row ${chartRow}).`,
              { stageId: stage.stage.id, chartId: zone.chartId, row: chartRow, col: cell.chartCol },
            ),
          );
          break;
        }
      }
    }
  }
  return out;
}

function sameSymbol(
  stage: ResolvedStage,
  zone: Zone,
  row: number,
  anchorCol: number,
  chartAnchor: number,
): boolean {
  if (anchorCol < zone.firstCol) return false;
  const anchor = stage.cellAtCol(row, anchorCol);
  return anchor.part === 0 && anchor.zone === zone && anchor.chartCol === chartAnchor;
}

/**
 * In flat stages every symbol that lands on a WS row needs a WS form. Rows repeat with the least
 * common multiple of the chart heights and 2 (row parity), so that many rows are enough.
 */
export function checkWrongSideSymbols(stage: ResolvedStage, maxRows = 2000): Diagnostic[] {
  if (stage.stage.construction !== 'flat') return [];
  const period = Math.min(
    maxRows,
    stage.zones.reduce((acc, z) => lcm(acc, z.chart.chart.height), 2),
  );
  const out: Diagnostic[] = [];
  const reported = new Set<string>();
  for (let row = 1; row <= period; row++) {
    if (stage.side(row) !== 'WS') continue;
    for (let stitch = 1; stitch <= stage.stitchCount; stitch++) {
      const cell = stage.cellAtStitch(row, stitch);
      const def = stage.symbol(cell);
      if (def.ws.mode !== 'unsupported' || cell.part !== 0) continue;
      const key = `${cell.zone.placementId}:${cell.chartRow}:${cell.chartCol}`;
      if (reported.has(key)) continue;
      reported.add(key);
      out.push(
        diagnostic(
          'ws-unsupported',
          'error',
          `${cell.zone.label}: symbol ${def.label.en} (chart row ${cell.chartRow}) falls on a wrong-side row, where it has no instruction.`,
          {
            stageId: stage.stage.id,
            chartId: cell.zone.chartId,
            row: cell.chartRow,
            col: cell.chartCol,
          },
        ),
      );
    }
  }
  return out;
}

/** All stage-level checks, including problems found while resolving the layout. */
export function validateStage(stage: ResolvedStage): Diagnostic[] {
  return [...stage.diagnostics, ...checkZoneEdges(stage), ...checkWrongSideSymbols(stage)];
}
