import type { Gauge, Pattern, Project, Segment } from '../schema/pattern';
import {
  legacyPatternSchema,
  legacyProjectSchema,
  type LegacyModification,
  type LegacyPattern,
  type LegacySegment,
  type LegacyStage,
} from './v2';

/**
 * Conversion from schema v2 (pattern with stages, project = one pattern) to v3 (project with
 * patterns, pattern with charts). Pure and lossless:
 *
 * - every stage becomes a pattern with the same id and name, carrying the charts it places
 *   (charts no stage places go to the first pattern, so nothing is lost);
 * - every pattern gets a copy of the custom symbols and the legend (a few kB, and each pattern
 *   stays self-contained, so it can be copied to another project later);
 * - project-level chart replacements move to every pattern that holds that chart;
 * - `continueFrom.stageId` becomes `continueFrom.patternId` (same id);
 * - progress per stage becomes progress per pattern (same id).
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function convertSegment(seg: LegacySegment): Segment {
  if (seg.kind === 'marker' || !seg.continueFrom) return seg as Segment;
  const { continueFrom, ...rest } = seg;
  return {
    ...rest,
    continueFrom: { patternId: continueFrom.stageId, placementId: continueFrom.placementId },
  };
}

function placedCharts(stage: LegacyStage): Set<string> {
  return new Set(stage.layout.flatMap((seg) => (seg.kind === 'chart' ? [seg.chartId] : [])));
}

/** The patterns (former stages) of a legacy pattern document. */
export function stagesToPatterns(
  legacy: LegacyPattern,
  modifications: readonly LegacyModification[] = [],
): Pattern[] {
  const used = new Set(legacy.stages.flatMap((s) => [...placedCharts(s)]));
  return legacy.stages.map((stage, index) => {
    const own = placedCharts(stage);
    const charts = legacy.charts.filter((c) => own.has(c.id) || (index === 0 && !used.has(c.id)));
    const chartIds = new Set(charts.map((c) => c.id));
    const mods = modifications.filter((m) => chartIds.has(m.chartId));
    const pattern: Pattern = {
      id: stage.id,
      name: stage.name.slice(0, 60),
      construction: stage.construction,
      firstRowSide: stage.firstRowSide,
      charts,
      symbols: legacy.symbols,
      legend: legacy.legend,
      layout: stage.layout.map(convertSegment),
      ...(stage.rows !== undefined ? { rows: stage.rows } : {}),
      ...(stage.expectedStitches !== undefined ? { expectedStitches: stage.expectedStitches } : {}),
      ...(stage.tracking !== undefined ? { tracking: stage.tracking } : {}),
      ...(stage.targetCm !== undefined ? { targetCm: stage.targetCm } : {}),
      ...(mods.length > 0 ? { modifications: mods } : {}),
    };
    return pattern;
  });
}

export interface LegacyProjectInfo {
  readonly id: string;
  readonly name: string;
  readonly sizeIndex: number;
  readonly activeStageId?: string;
  readonly modifications?: readonly LegacyModification[];
  readonly finishedRows?: Readonly<Record<string, number>>;
  readonly gauge?: Gauge;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A v3 project from a legacy pattern and (optionally) the legacy project that tracked it. */
export function legacyToProject(legacy: LegacyPattern, info: LegacyProjectInfo): Project {
  const patterns = stagesToPatterns(legacy, info.modifications);
  const active =
    info.activeStageId && patterns.some((p) => p.id === info.activeStageId)
      ? info.activeStageId
      : patterns[0]?.id;
  const sizeIndex = info.sizeIndex < legacy.sizes.length ? info.sizeIndex : 0;
  return {
    id: info.id,
    name: info.name.slice(0, 120) || legacy.title,
    revision: legacy.revision,
    ...(legacy.designer !== undefined ? { designer: legacy.designer } : {}),
    ...(legacy.notes !== undefined ? { notes: legacy.notes } : {}),
    sizes: legacy.sizes,
    sizeIndex,
    ...(legacy.gauge ? { gauge: legacy.gauge } : {}),
    ...(info.gauge ? { knitterGauge: info.gauge } : {}),
    patterns,
    ...(active ? { activePatternId: active } : {}),
    ...(info.finishedRows && Object.keys(info.finishedRows).length > 0
      ? { finishedRows: { ...info.finishedRows } }
      : {}),
    createdAt: info.createdAt,
    updatedAt: info.updatedAt,
  };
}

const FALLBACK_TIME = '2026-01-01T00:00:00.000Z';
const isoOr = (v: unknown, fallback: string): string =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback;

/** v2 pattern file → v3 project file (the document shape; validated by the reader). */
export function migratePatternFileDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const parsed = legacyPatternSchema.safeParse(doc['pattern']);
  if (!parsed.success) return doc;
  const time = isoOr(doc['exportedAt'], FALLBACK_TIME);
  const legacy = parsed.data;
  const { pattern: _old, ...rest } = doc;
  return {
    ...rest,
    format: 'knitting-tracker/project',
    project: legacyToProject(legacy, {
      id: legacy.id,
      name: legacy.title,
      sizeIndex: 0,
      createdAt: time,
      updatedAt: time,
    }),
  };
}

/**
 * v2 backup → v3 backup: every legacy project becomes a project holding its pattern's content;
 * a stored pattern no project used becomes a project of its own (with no progress). Progress
 * records are re-keyed from stage to pattern. Records that do not parse are passed on unchanged,
 * so the reader reports them as skipped.
 */
export function migrateBackupDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const rawPatterns = Array.isArray(doc['patterns']) ? doc['patterns'] : [];
  const rawProjects = Array.isArray(doc['projects']) ? doc['projects'] : [];
  const rawProgress = Array.isArray(doc['progress']) ? doc['progress'] : [];

  const stored = new Map<string, { pattern: LegacyPattern; time: string }>();
  for (const item of rawPatterns) {
    if (!isRecord(item) || typeof item['id'] !== 'string') continue;
    const parsed = legacyPatternSchema.safeParse(item['pattern']);
    if (!parsed.success) continue;
    stored.set(item['id'], {
      pattern: parsed.data,
      time: isoOr(item['updatedAt'] ?? item['importedAt'], FALLBACK_TIME),
    });
  }

  const projects: unknown[] = [];
  const usedPatterns = new Set<string>();
  const projectIds = new Set<string>();
  for (const item of rawProjects) {
    const parsed = legacyProjectSchema.omit({ progress: true }).safeParse(item);
    const source = parsed.success ? stored.get(parsed.data.patternId) : undefined;
    if (!parsed.success || !source) {
      projects.push(item);
      continue;
    }
    const p = parsed.data;
    usedPatterns.add(p.patternId);
    projectIds.add(p.id);
    projects.push(
      legacyToProject(source.pattern, {
        id: p.id,
        name: p.name,
        sizeIndex: p.sizeIndex,
        activeStageId: p.activeStageId,
        modifications: p.modifications,
        ...(p.finishedRows ? { finishedRows: p.finishedRows } : {}),
        ...(p.gauge ? { gauge: p.gauge } : {}),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }),
    );
  }
  for (const [id, { pattern, time }] of stored) {
    if (usedPatterns.has(id)) continue;
    let projectId = id;
    for (let n = 2; projectIds.has(projectId); n++) projectId = `${id}-${n}`;
    projectIds.add(projectId);
    projects.push(
      legacyToProject(pattern, {
        id: projectId,
        name: pattern.title,
        sizeIndex: 0,
        createdAt: time,
        updatedAt: time,
      }),
    );
  }

  const progress = rawProgress.map((item) => {
    if (!isRecord(item) || typeof item['stageId'] !== 'string') return item;
    const { stageId, ...rest } = item;
    return { ...rest, patternId: stageId };
  });

  const { patterns: _patterns, ...rest } = doc;
  return { ...rest, projects, progress };
}
