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
  customToSymbolDef,
  effectiveCharts,
  findStage,
  patternRegistry,
  resolveStage,
  type Marker,
  type ResolveOptions,
  type ResolvedStage,
  type Section,
  type Side,
  type StageCell,
  type Zone,
} from './layout/resolve';

export {
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

export { rowInstructions, type InstructionToken, type RowInstructions } from './instructions/row';

export {
  checkStitchChain,
  checkStitchFlow,
  consumedInRow,
  producedInRow,
  validateChart,
} from './validate/chart';
export { checkWrongSideSymbols, checkZoneEdges, validateStage } from './validate/stage';
export { checkReferences, validatePattern, type PatternReport } from './validate/pattern';

export {
  MIGRATIONS,
  migrate,
  readPatternFile,
  serializePattern,
  type Migration,
  type ReadResult,
} from './io/file';
