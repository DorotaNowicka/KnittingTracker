// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient types for a module pdf.js ships untyped; an import would pull it into this program as a value
/// <reference path="../pdfjs-worker.d.ts" />
import type { PdfJsLike } from './analyze';

let loaded: Promise<PdfJsLike> | null = null;

/**
 * Load pdf.js for use inside a Web Worker. Its own worker code is imported into this same thread
 * ("fake worker"), so no extra worker or script URL is needed and the strict CSP stays intact.
 * The legacy build is used for older Safari versions.
 */
export function loadPdfJs(): Promise<PdfJsLike> {
  loaded ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ]).then(([lib, worker]) => {
    (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;
    return lib as unknown as PdfJsLike;
  });
  return loaded;
}
