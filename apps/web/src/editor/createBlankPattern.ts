import { blankPattern } from '@kt/core';
import { newId } from '../lib/files';
import { navigate, paths } from '../lib/router';
import type { StoredPattern } from '../lib/storage';
import { useLibrary } from '../state/library';

/** Start a new, empty pattern and open it in the editor. */
export async function createBlankPattern(title: string, sizeLabel: string, stageName: string) {
  const id = `wzor-${newId().slice(0, 8)}`;
  const pattern = blankPattern({ id, title, sizes: [sizeLabel], stageName });
  const stored: StoredPattern = {
    id,
    pattern,
    source: 'user',
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await useLibrary.getState().updatePattern(stored);
  navigate(paths.pattern(id));
}
