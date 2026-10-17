import { localOnlySync, type SyncAdapter } from '@kt/core';

/**
 * The app's sync adapter (ADR-4). Version 1 is local only; moving data between devices uses
 * backup files. Swapping in a real adapter later changes only this line.
 */
export const sync: SyncAdapter = localOnlySync;
