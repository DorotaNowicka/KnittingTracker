import { diagnostic, type Diagnostic, type SizeValue } from '../basics';
import { parseChart } from '../chart/parse';
import { patternRegistry, resolveStage } from '../layout/resolve';
import type { Modification, Pattern } from '../schema/pattern';
import type { SymbolRegistry } from '../symbols/registry';
import { validateChart } from './chart';
import { validateStage } from './stage';

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

function checkSizeValue(
  value: SizeValue | undefined,
  sizes: number,
  label: string,
  stageId: string,
): Diagnostic[] {
  if (value === undefined || typeof value === 'number' || value.length === sizes) return [];
  return [
    diagnostic(
      'size-list',
      'error',
      `${label} lists ${value.length} values but the pattern has ${sizes} sizes.`,
      { stageId },
    ),
  ];
}

/** Referential integrity: unique ids, known references, per-size lists of the right length. */
export function checkReferences(pattern: Pattern, registry: SymbolRegistry): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const id of duplicates(pattern.charts.map((c) => c.id))) {
    out.push(
      diagnostic('duplicate-chart', 'error', `Chart id "${id}" is used twice.`, { chartId: id }),
    );
  }
  for (const id of duplicates(pattern.stages.map((s) => s.id))) {
    out.push(
      diagnostic('duplicate-stage', 'error', `Stage id "${id}" is used twice.`, { stageId: id }),
    );
  }
  for (const entry of pattern.legend) {
    if (!registry.has(entry.symbolId)) {
      out.push(
        diagnostic(
          'legend-unknown-symbol',
          'error',
          `Legend refers to unknown symbol ${entry.symbolId}.`,
        ),
      );
    }
  }
  const chartIds = new Set(pattern.charts.map((c) => c.id));
  const n = pattern.sizes.length;
  for (const stage of pattern.stages) {
    const ids = stage.layout.map((s) => (s.kind === 'chart' ? s.placementId : s.id));
    for (const id of duplicates(ids)) {
      out.push(
        diagnostic('duplicate-placement', 'error', `Id "${id}" appears twice in ${stage.name}.`, {
          stageId: stage.id,
        }),
      );
    }
    out.push(...checkSizeValue(stage.rows, n, `${stage.name}: rows`, stage.id));
    out.push(
      ...checkSizeValue(stage.expectedStitches, n, `${stage.name}: expected stitches`, stage.id),
    );
    for (const seg of stage.layout) {
      if (seg.kind !== 'chart') continue;
      if (!chartIds.has(seg.chartId)) {
        out.push(
          diagnostic('unknown-chart', 'error', `${stage.name} uses unknown chart ${seg.chartId}.`, {
            stageId: stage.id,
          }),
        );
      }
      out.push(
        ...checkSizeValue(seg.stitches, n, `${stage.name}: ${seg.placementId} stitches`, stage.id),
      );
    }
  }
  return out;
}

export interface PatternReport {
  readonly diagnostics: readonly Diagnostic[];
  readonly ok: boolean;
}

/**
 * Validate a whole pattern: references, every chart (structure, stitch chain, stitch flow) and
 * every stage in every size. Never throws for content problems.
 */
export function validatePattern(
  pattern: Pattern,
  modifications: readonly Modification[] = [],
): PatternReport {
  let registry: SymbolRegistry;
  try {
    registry = patternRegistry(pattern);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, diagnostics: [diagnostic('symbols', 'error', message)] };
  }
  const out: Diagnostic[] = [...checkReferences(pattern, registry)];
  if (out.some((d) => d.severity === 'error')) return { ok: false, diagnostics: out };

  for (const chart of pattern.charts)
    out.push(...validateChart(parseChart(chart, registry), registry));
  for (const m of modifications) {
    if (m.kind === 'replaceChart')
      out.push(...validateChart(parseChart(m.chart, registry), registry));
  }
  const structural = out.some((d) => d.severity === 'error');
  if (!structural) {
    for (const stage of pattern.stages) {
      for (let size = 0; size < pattern.sizes.length; size++) {
        const resolved = resolveStage(pattern, stage.id, size, { modifications, registry });
        // Chart diagnostics were already reported above; keep only stage-specific ones.
        const stageDiags = validateStage(resolved).filter((d) => d.stageId !== undefined);
        const label = pattern.sizes[size] ?? String(size);
        out.push(...stageDiags.map((d) => ({ ...d, message: `[${label}] ${d.message}` })));
      }
    }
  }
  return { ok: !out.some((d) => d.severity === 'error'), diagnostics: out };
}
