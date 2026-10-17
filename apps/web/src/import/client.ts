import { sniffType, UPLOAD_LIMITS, type ImportProgress, type ImportResult } from '@kt/importer';
import type { ImportErrorCode, ImportRequest, ImportResponse } from './protocol';

/** A file checked on the main thread before it reaches the worker (NFR-5). */
export interface CheckedFile {
  readonly kind: 'pdf' | 'image';
  readonly name: string;
  readonly bytes: ArrayBuffer;
}

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode | 'too-large' | 'wrong-type') {
    super(code);
  }
}

/** Size limit and real type (magic bytes, never the extension). */
export async function checkFile(file: File, allow: 'any' | 'pdf' = 'any'): Promise<CheckedFile> {
  if (file.size > UPLOAD_LIMITS.maxBytes) throw new ImportError('too-large');
  const bytes = await file.arrayBuffer();
  const type = sniffType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
  if (type === 'pdf') return { kind: 'pdf', name: file.name, bytes };
  if (allow === 'any' && (type === 'png' || type === 'jpeg' || type === 'webp')) {
    return { kind: 'image', name: file.name, bytes };
  }
  throw new ImportError('wrong-type');
}

interface Pending {
  resolve(r: ImportResponse): void;
  reject(e: unknown): void;
  onProgress?: (p: ImportProgress) => void;
}

/** Talks to the import worker; one request at a time is enough for the wizard. */
export class ImportClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'import',
    });
    w.onmessage = (e: MessageEvent<ImportResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') {
        p.onProgress?.(msg.progress);
        return;
      }
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new ImportError(msg.code));
      else p.resolve(msg);
    };
    w.onerror = () => {
      for (const p of this.pending.values()) p.reject(new ImportError('unreadable'));
      this.pending.clear();
    };
    this.worker = w;
    return w;
  }

  private send(
    build: (id: number) => ImportRequest,
    transfer: Transferable[],
    onProgress?: (p: ImportProgress) => void,
  ) {
    const id = ++this.seq;
    return new Promise<ImportResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...(onProgress ? { onProgress } : {}) });
      this.ensure().postMessage(build(id), transfer);
    });
  }

  async recognize(
    file: CheckedFile,
    options: {
      corners?: readonly (readonly [number, number])[];
      onProgress?: (p: ImportProgress) => void;
    } = {},
  ): Promise<ImportResult> {
    // The worker gets its own copy; the app keeps the bytes for a re-run with other corners.
    const bytes = file.bytes.slice(0);
    const res = await this.send(
      (id) =>
        file.kind === 'pdf'
          ? { type: 'pdf', id, bytes }
          : { type: 'image', id, bytes, ...(options.corners ? { corners: options.corners } : {}) },
      [bytes],
      options.onProgress,
    );
    if (res.type !== 'result') throw new ImportError('unreadable');
    return res.result;
  }

  async rerecognize(
    symbols: readonly string[],
    legend: ImportResult['legend'],
  ): Promise<ImportResult> {
    const res = await this.send((id) => ({ type: 'rerecognize', id, symbols, legend }), []);
    if (res.type !== 'result') throw new ImportError('unreadable');
    return res.result;
  }

  async decode(
    file: CheckedFile,
  ): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
    const bytes = file.bytes.slice(0);
    const res = await this.send((id) => ({ type: 'decode', id, bytes }), [bytes]);
    if (res.type !== 'decoded') throw new ImportError('unreadable');
    return res;
  }

  async text(file: CheckedFile) {
    const bytes = file.bytes.slice(0);
    const res = await this.send((id) => ({ type: 'text', id, bytes }), [bytes]);
    if (res.type !== 'text') throw new ImportError('unreadable');
    return { text: res.text, description: res.description };
  }

  /** Stop any work in progress (a new worker starts on the next request). */
  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new ImportError('aborted'));
    this.pending.clear();
  }
}
