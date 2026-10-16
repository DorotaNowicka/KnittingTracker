/**
 * @kt/importer — local, in-browser pattern import (ADR-5). Everything here runs in Web Workers and
 * never sends files anywhere.
 *
 */

export type SniffedType = 'pdf' | 'png' | 'jpeg' | 'webp' | 'unknown';

/** Detect the real file type from its first bytes (magic numbers); never trust the extension. */
export function sniffType(head: Uint8Array): SniffedType {
  const starts = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf'; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpeg';
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return 'webp'; // RIFF....WEBP
  }
  return 'unknown';
}

export {
  buildTemplates,
  cropRgba,
  DEFAULT_SYMBOLS,
  importImage,
  importPdf,
  rerecognize,
  UPLOAD_LIMITS,
  type FoundChart,
  type ImportOptions,
  type ImportProgress,
  type ImportResult,
  type SourceImage,
} from './pipeline';
export type { RecognizedCell, RecognizedChart, Scored } from './raster/classify';
export type { DetectedGrid } from './raster/grid';
export type { LegendItem } from './legend/pair';
export type { ParsedDescription, SequenceItem } from './describe/parse';
export { parseDescription } from './describe/parse';
export type { PdfJsLike } from './pdf/analyze';
