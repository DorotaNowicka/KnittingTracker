/**
 * @kt/importer — local, in-browser pattern import (ADR-5). Everything here runs in Web Workers and
 * never sends files anywhere.
 *
 * M0 ships the upload limits (NFR-5) because the web app validates files before they reach a worker.
 */

export const UPLOAD_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxPdfPages: 30,
  maxImagePixels: 40_000_000,
} as const;

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
