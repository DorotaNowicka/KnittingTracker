import { diagnostic, type Diagnostic, type SizeValue } from '../basics';
import { parseChart } from '../chart/parse';
import { patternRegistry, resolvePattern } from '../layout/resolve';
import type { Pattern, ProjectContent } from '../schema/pattern';
import type { SymbolRegistry } from '../symbols/registry';
import { validateChart } from './chart';
import { validateGrid } from './grid';

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
  patternId: string,
): Diagnostic[] {
  if (value === undefined || typeof value === 'number' || value.length === sizes) return [];
  return [
    diagnostic(
      'size-list',
      'error',
      `${label} lists ${value.length} values but the project has ${sizes} sizes.`,
      { patternId },
      { label, actual: value.length, expected: sizes },
    ),
  ];
}

/**
 * Referential integrity of one pattern: unique chart and placement ids, known references, per-size
 * lists that match the project's sizes.
 */
export function checkReferences(
  pattern: Pattern,
  sizeCount: number,
  registry: SymbolRegistry,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const where = { patternId: pattern.id };
  for (const id of duplicates(pattern.charts.map((c) => c.id))) {
    out.push(
      diagnostic(
        'duplicate-chart',
        'error',
        `Chart id "${id}" is used twice.`,
        { ...where, chartId: id },
        { id },
      ),
    );
  }
  for (const entry of pattern.legend) {
    if (!registry.has(entry.symbolId)) {
      out.push(
        diagnostic(
          'legend-unknown-symbol',
          'error',
          `Legend refers to unknown symbol ${entry.symbolId}.`,
          where,
          { symbol: entry.symbolId },
        ),
      );
    }
  }
  const chartIds = new Set(pattern.charts.map((c) => c.id));
  const ids = pattern.layout.map((s) => (s.kind === 'chart' ? s.placementId : s.id));
  for (const id of duplicates(ids)) {
    out.push(
      diagnostic(
        'duplicate-placement',
        'error',
        `Id "${id}" appears twice in ${pattern.name}.`,
        where,
        { id, pattern: pattern.name },
      ),
    );
  }
  out.push(...checkSizeValue(pattern.rows, sizeCount, `${pattern.name}: rows`, pattern.id));
  out.push(
    ...checkSizeValue(
      pattern.expectedStitches,
      sizeCount,
      `${pattern.name}: expected stitches`,
      pattern.id,
    ),
  );
  out.push(
    ...checkSizeValue(pattern.targetCm, sizeCount, `${pattern.name}: target length`, pattern.id),
  );
  for (const seg of pattern.layout) {
    if (seg.kind !== 'chart') continue;
    if (!chartIds.has(seg.chartId)) {
      out.push(
        diagnostic(
          'unknown-chart',
          'error',
          `${pattern.name} uses unknown chart ${seg.chartId}.`,
          where,
          { pattern: pattern.name, chart: seg.chartId },
        ),
      );
    }
    out.push(
      ...checkSizeValue(
        seg.stitches,
        sizeCount,
        `${pattern.name}: ${seg.placementId} stitches`,
        pattern.id,
      ),
    );
  }
  for (const m of pattern.modifications ?? []) {
    if (!chartIds.has(m.chartId)) {
      out.push(
        diagnostic(
          'unknown-chart',
          'error',
          `A change in ${pattern.name} refers to unknown chart ${m.chartId}.`,
          where,
          { pattern: pattern.name, chart: m.chartId },
        ),
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
 * Validate one pattern of a project: references, every chart (structure, stitch chain, stitch
 * flow) and the grid in every size. Never throws for content problems.
 */
export function validatePattern(project: ProjectContent, patternId: string): PatternReport {
  const pattern = project.patterns.find((p) => p.id === patternId);
  if (!pattern) {
    return {
      ok: false,
      diagnostics: [diagnostic('unknown-pattern', 'error', `Unknown pattern ${patternId}.`)],
    };
  }
  let registry: SymbolRegistry;
  try {
    registry = patternRegistry(pattern);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      diagnostics: [diagnostic('symbols', 'error', message, { patternId: pattern.id })],
    };
  }
  const sizes = project.sizes;
  const out: Diagnostic[] = [...checkReferences(pattern, sizes.length, registry)];
  if (out.some((d) => d.severity === 'error')) return { ok: false, diagnostics: out };

  const withPattern = (d: Diagnostic): Diagnostic => ({ ...d, patternId: pattern.id });
  for (const chart of pattern.charts)
    out.push(...validateChart(parseChart(chart, registry), registry).map(withPattern));
  for (const m of pattern.modifications ?? []) {
    out.push(...validateChart(parseChart(m.chart, registry), registry).map(withPattern));
  }
  const structural = out.some((d) => d.severity === 'error');
  if (!structural) {
    // The same finding in every size is reported once, without a size label.
    const bySize = sizes.map((_, size) =>
      validateGrid(resolvePattern(project, pattern.id, { sizeIndex: size, registry }))
        // Chart diagnostics were already reported above; keep only grid-specific ones.
        .filter((d) => d.patternId !== undefined),
    );
    const keyOf = (d: Diagnostic) => JSON.stringify([d.code, d.message, d.row, d.col, d.chartId]);
    const inAll = new Set(
      (bySize[0] ?? [])
        .map(keyOf)
        .filter((k) => bySize.every((list) => list.some((d) => keyOf(d) === k))),
    );
    const reported = new Set<string>();
    bySize.forEach((list, size) => {
      const label = sizes[size] ?? String(size);
      for (const d of list) {
        const k = keyOf(d);
        if (inAll.has(k) && sizes.length > 1) {
          if (!reported.has(k)) out.push(d);
          reported.add(k);
          continue;
        }
        out.push(
          sizes.length > 1
            ? { ...d, message: `[${label}] ${d.message}`, params: { ...d.params, size: label } }
            : d,
        );
      }
    });
  }
  return { ok: !out.some((d) => d.severity === 'error'), diagnostics: out };
}

export interface ProjectReport extends PatternReport {
  /** Report of each pattern, by pattern id. */
  readonly patterns: Readonly<Record<string, PatternReport>>;
}

/** Validate every pattern of a project, plus project-level rules (unique pattern ids). */
export function validateProject(project: ProjectContent): ProjectReport {
  const out: Diagnostic[] = [];
  for (const id of duplicates(project.patterns.map((p) => p.id))) {
    out.push(
      diagnostic(
        'duplicate-pattern',
        'error',
        `Pattern id "${id}" is used twice.`,
        { patternId: id },
        { id },
      ),
    );
  }
  if (project.sizeIndex >= project.sizes.length) {
    out.push(
      diagnostic(
        'size-index',
        'error',
        `The chosen size does not exist.`,
        {},
        {
          index: project.sizeIndex,
        },
      ),
    );
  }
  const patterns: Record<string, PatternReport> = {};
  if (out.length === 0) {
    for (const p of project.patterns) {
      const report = validatePattern(project, p.id);
      patterns[p.id] = report;
      out.push(...report.diagnostics);
    }
  }
  return { ok: !out.some((d) => d.severity === 'error'), diagnostics: out, patterns };
}
