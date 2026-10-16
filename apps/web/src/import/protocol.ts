import type { ImportProgress, ImportResult, LegendItem, ParsedDescription } from '@kt/importer';

/**
 * Messages between the app and the import worker. Files are passed as bytes and never leave the
 * device (FR-3); the worker keeps the last result so a re-run doesn't copy the images again.
 */
export type ImportRequest =
  | { readonly type: 'pdf'; readonly id: number; readonly bytes: ArrayBuffer }
  | {
      readonly type: 'image';
      readonly id: number;
      readonly bytes: ArrayBuffer;
      /** Crop & straighten: corners in image pixels (TL, TR, BR, BL). */
      readonly corners?: readonly (readonly [number, number])[];
    }
  | {
      readonly type: 'rerecognize';
      readonly id: number;
      readonly symbols: readonly string[];
      readonly legend: readonly LegendItem[];
    }
  /** Text of a second PDF holding the pattern description. */
  | { readonly type: 'text'; readonly id: number; readonly bytes: ArrayBuffer }
  /** Decode an image only (for the straighten step): returns a preview. */
  | { readonly type: 'decode'; readonly id: number; readonly bytes: ArrayBuffer };

export type ImportResponse =
  | { readonly type: 'progress'; readonly id: number; readonly progress: ImportProgress }
  | { readonly type: 'result'; readonly id: number; readonly result: ImportResult }
  | {
      readonly type: 'text';
      readonly id: number;
      readonly text: string;
      readonly description: ParsedDescription;
    }
  | {
      readonly type: 'decoded';
      readonly id: number;
      readonly width: number;
      readonly height: number;
      readonly rgba: Uint8ClampedArray;
    }
  | { readonly type: 'error'; readonly id: number; readonly code: ImportErrorCode };

export type ImportErrorCode =
  'too-many-pages' | 'too-many-pixels' | 'unreadable' | 'no-result' | 'aborted' | 'unsupported';
