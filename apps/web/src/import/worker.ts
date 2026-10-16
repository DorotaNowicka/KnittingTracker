import {
  extractPdfText,
  importImage,
  importPdf,
  loadPdfJs,
  rerecognize,
  type ImportProgress,
  type ImportResult,
} from '@kt/importer';
import type { ImportErrorCode, ImportRequest, ImportResponse } from './protocol';

/**
 * Import worker (ADR-5): PDF analysis and chart recognition off the main thread. pdf.js runs in
 * this same worker ("fake worker": its message handler is imported here), with eval disabled and no
 * fonts or scripts. Nothing here uses the network.
 */
declare const self: DedicatedWorkerGlobalScope;

async function decode(bytes: ArrayBuffer) {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const { width, height } = bitmap;
  if (width * height > 40_000_000) {
    bitmap.close();
    throw new Error('too-many-pixels');
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('unsupported');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
}

let last: ImportResult | null = null;

const post = (msg: ImportResponse, transfer: Transferable[] = []) =>
  self.postMessage(msg, transfer);

function codeOf(error: unknown): ImportErrorCode {
  const m = error instanceof Error ? error.message : String(error);
  if (m.startsWith('too-many-pages')) return 'too-many-pages';
  if (m === 'too-many-pixels') return 'too-many-pixels';
  if (m === 'aborted') return 'aborted';
  if (m === 'unsupported') return 'unsupported';
  return 'unreadable';
}

self.onmessage = async (e: MessageEvent<ImportRequest>) => {
  const req = e.data;
  const onProgress = (progress: ImportProgress) => post({ type: 'progress', id: req.id, progress });
  try {
    if (req.type === 'decode') {
      const img = await decode(req.bytes);
      post({ type: 'decoded', id: req.id, ...img }, [img.rgba.buffer]);
      return;
    }
    if (req.type === 'text') {
      const { text, description } = await extractPdfText(
        await loadPdfJs(),
        new Uint8Array(req.bytes),
      );
      post({ type: 'text', id: req.id, text, description });
      return;
    }
    if (req.type === 'pdf') {
      last = await importPdf(await loadPdfJs(), new Uint8Array(req.bytes), { onProgress });
    } else if (req.type === 'image') {
      const img = await decode(req.bytes);
      last = importImage(img, { onProgress, ...(req.corners ? { corners: req.corners } : {}) });
    } else {
      if (!last) throw new Error('no-result');
      last = rerecognize(last, req.symbols, req.legend);
    }
    // The worker keeps its copy (for re-runs): the result is cloned, not transferred.
    post({ type: 'result', id: req.id, result: last });
  } catch (error) {
    console.error('[import worker]', error);
    post({
      type: 'error',
      id: req.id,
      code: error instanceof Error && error.message === 'no-result' ? 'no-result' : codeOf(error),
    });
  }
};
