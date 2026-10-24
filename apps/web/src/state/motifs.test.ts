import { applySymbolRows, blankChart } from '@kt/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../lib/storage';
import { setStorageForTests } from './library';
import { useMotifs } from './motifs';

const own = (id: string) =>
  applySymbolRows(blankChart({ id, name: 'Mój warkocz' }, 1, 1), [['std:k', 'std:p']]);

describe('own pieces of pattern', () => {
  beforeEach(() => useMotifs.setState({ status: 'idle', motifs: [] }));

  it('are kept with the settings and shared by every project', async () => {
    const storage = createMemoryStorage();
    setStorageForTests(storage);
    await useMotifs.getState().save(own('own:a'));
    await useMotifs.getState().save({ ...own('own:a'), name: 'Zmieniony' });
    await useMotifs.getState().save(own('own:b'));
    expect(useMotifs.getState().motifs.map((m) => m.name)).toEqual(['Zmieniony', 'Mój warkocz']);

    useMotifs.setState({ status: 'idle', motifs: [] });
    await useMotifs.getState().load();
    expect(useMotifs.getState().motifs.map((m) => m.id)).toEqual(['own:a', 'own:b']);
    await useMotifs.getState().remove('own:a');
    expect(await storage.getSetting('motifs')).toEqual([own('own:b')]);
  });

  it('ignores stored data that is not a list of pieces', async () => {
    const storage = createMemoryStorage();
    await storage.setSetting('motifs', [{ id: 'x' }]);
    setStorageForTests(storage);
    await useMotifs.getState().load();
    expect(useMotifs.getState()).toMatchObject({ status: 'ready', motifs: [] });
  });
});
