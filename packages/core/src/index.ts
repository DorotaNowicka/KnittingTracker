/**
 * @kt/core — pure domain layer of KnittingTracker (ADR-2).
 *
 * Hard rule (NFR-1): no DOM/UI/storage dependencies. The tsconfig `lib` has no "DOM" and ESLint
 * forbids browser globals and UI/storage imports here.
 */

export * from './basics';

export type {
  Glyph,
  GlyphPoint,
  GlyphPrimitive,
  StitchKind,
  SymbolDef,
  SymbolFamily,
  WsBehavior,
} from './symbols/types';
export { cable, type CableSpec } from './symbols/cable';
export { BUILTIN_SYMBOLS, STD } from './symbols/library';
export { createRegistry, wsSymbolId, type SymbolRegistry } from './symbols/registry';

export * from './schema/pattern';

export {
  chartCell,
  chartFromSymbolRows,
  parseChart,
  type ChartCell,
  type ParsedChart,
} from './chart/parse';

export {
  anchorAt,
  applySymbolRows,
  blankChart,
  chartToSymbolRows,
  copyRect,
  DEFAULT_FILL,
  deleteColumns,
  deleteRows,
  fillRect,
  gridWidth,
  insertColumns,
  insertRows,
  mirrorRect,
  mirrorSymbolId,
  normalizeRect,
  paintCell,
  pasteClip,
  repairRows,
  resizeRows,
  snapRect,
  symbolUsage,
  type CellRect,
  type Clip,
  type ResizeAnchor,
  type SymbolRows,
} from './chart/edit';

export {
  createHistory,
  EDITOR_HISTORY_LIMIT,
  pushHistory,
  redoHistory,
  replacePresent,
  undoHistory,
  type History,
} from './history';

export * from './authoring/pattern';
export * from './authoring/kinds';
export * from './design/compose';
export * from './design/motifs';
export * from './design/fromLayout';

export {
  customToSymbolDef,
  effectiveCharts,
  findPattern,
  patternRegistry,
  patternRows,
  resolvePattern,
  type GridCell,
  type Marker,
  type ResolveOptions,
  type ResolvedPattern,
  type Section,
  type Side,
  type Zone,
} from './layout/resolve';

export {
  createCounterModel,
  createProgressModel,
  createRowModel,
  indexOfCol,
  indexOfStitch,
  lastDone,
  nextStitch,
  stitchAt,
  summarize,
  type ProgressSummary,
  type RowModel,
  type StitchLocation,
} from './progress/position';
export {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  initialProgress,
  reduceProgress,
  type ProgressAction,
  type ProgressState,
  type TapMode,
} from './progress/actions';

export {
  cmForRows,
  effectiveGauge,
  lengthEstimate,
  rowsForCm,
  type LengthEstimate,
} from './progress/estimate';

export { rowInstructions, type InstructionToken, type RowInstructions } from './instructions/row';

export {
  checkStitchChain,
  checkStitchFlow,
  consumedInRow,
  producedInRow,
  validateChart,
} from './validate/chart';
export { checkWrongSideSymbols, checkZoneEdges, validateGrid } from './validate/grid';
export {
  checkReferences,
  validatePattern,
  validateProject,
  type PatternReport,
  type ProjectReport,
} from './validate/pattern';

export {
  MIGRATIONS,
  migrate,
  readProjectFile,
  serializeProject,
  type Migration,
  type ReadResult,
} from './io/file';

export {
  planRestore,
  readBackupFile,
  serializeBackup,
  storedProgressSchema,
  storedProjectSchema,
  type BackupContent,
  type ReadBackup,
  type RestoreAction,
  type RestorePlan,
  type RestorePlanItem,
  type StoredProgressRecord,
  type StoredProjectRecord,
} from './io/backup';

export {
  legacyToProject,
  migrateBackupDoc,
  migratePatternFileDoc,
  stagesToPatterns,
  type LegacyProjectInfo,
} from './legacy/convert';
export {
  legacyPatternSchema,
  legacyProjectSchema,
  type LegacyPattern,
  type LegacyProject,
} from './legacy/v2';

export {
  localOnlySync,
  syncDocId,
  type PushOutcome,
  type SyncAdapter,
  type SyncCursor,
  type SyncDoc,
  type SyncStatus,
} from './sync/adapter';
