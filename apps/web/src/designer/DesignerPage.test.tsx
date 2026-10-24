import { blankProject, chartToSymbolRows } from '@kt/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate, paths } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { useDraft } from '../state/draft';
import { setStorageForTests, useLibrary } from '../state/library';
import { useMotifs } from '../state/motifs';

beforeAll(() => {
  initI18n('pl');
});

beforeEach(async () => {
  setStorageForTests(createMemoryStorage());
  useLibrary.setState({
    status: 'idle',
    projects: [],
    progress: {},
    persist: null,
    storageKind: null,
  });
  useMotifs.setState({ status: 'idle', motifs: [] });
  await useLibrary.getState().addProject(
    blankProject({
      id: 'p1',
      name: 'Sweter',
      kind: 'sweater',
      sizes: ['M'],
      patternName: 'Korpus',
      now: '2026-10-24T10:00:00.000Z',
    }),
  );
});

const pattern = () => useDraft.getState().project?.patterns[0];

describe('pattern creator', () => {
  it('starts with the grid size, then places a rib 113 times and a cable above it', async () => {
    const user = userEvent.setup();
    navigate(paths.designer('p1', 'pattern-1'), { replace: true });
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kreator wzoru: Korpus' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Szerokość (oczka)'), '226');
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), '20');
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));

    // The rib: 113 times across, 2 rows up.
    await user.click(await screen.findByRole('button', { name: /Ściągacz 1\/1/ }));
    const form = () => screen.getByRole('region', { name: 'Wstaw: Ściągacz 1/1' });
    const across = within(form()).getByRole('group', { name: 'W poziomie (w lewo)' });
    await user.click(within(across).getByRole('radio', { name: 'Określoną liczbę razy' }));
    const times = within(across).getByLabelText('Ile razy');
    await user.clear(times);
    await user.type(times, '113');
    const up = within(form()).getByRole('group', { name: 'W górę' });
    await user.click(within(up).getByRole('radio', { name: 'Określoną liczbę razy' }));
    const rows = within(up).getByLabelText('Ile razy');
    await user.clear(rows);
    await user.type(rows, '2');
    expect(within(form()).getByText('113 × 2 = 226 oczek')).toBeInTheDocument();
    expect(within(form()).getByText('2 × 1 = 2 rzędy')).toBeInTheDocument();
    await user.click(within(form()).getByRole('button', { name: 'Wstaw na siatkę' }));

    // The cable from row 3 to the top, across the whole width.
    await user.click(screen.getByRole('button', { name: /Warkocz 2\/2 w lewo/ }));
    const cable = screen.getByRole('region', { name: 'Wstaw: Warkocz 2/2 w lewo' });
    const start = within(cable).getByLabelText('Od rzędu (od dołu)');
    await user.clear(start);
    await user.type(start, '3');
    expect(within(cable).getByText('37,67 × 6 = 226 oczek')).toBeInTheDocument();
    expect(within(cable).getByText('4,5 × 4 = 18 rzędów')).toBeInTheDocument();
    expect(within(cable).getByText(/niepełne: 4 z 6 oczek/)).toBeInTheDocument();
    await user.click(within(cable).getByRole('button', { name: 'Wstaw na siatkę' }));

    const placed = screen.getByRole('region', { name: 'Na siatce' });
    expect(
      within(placed)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining(
        'Ściągacz 1/1od oczka 1, rzędu 1 · w poziomie 113 razy · w górę 2 razy',
      ),
      expect.stringContaining(
        'Warkocz 2/2 w lewood oczka 1, rzędu 3 · w poziomie do końca · w górę do końca',
      ),
    ]);
    await waitFor(() => expect(pattern()?.design?.placements).toHaveLength(2));
    const p = pattern();
    expect(p?.rows).toBe(20);
    const grid = p?.charts[0] ? chartToSymbolRows(p.charts[0]) : [];
    expect(grid).toHaveLength(20);
    expect(grid[0]?.filter((id) => id === 'std:p')).toHaveLength(113);
    expect(grid[4]?.filter((id) => id === 'cable:2-2-lc')).toHaveLength(37);

    // Change the rib to the whole height; the cable stays on top.
    await user.click(within(placed).getByRole('button', { name: 'Zmień Ściągacz 1/1' }));
    const change = screen.getByRole('region', { name: 'Zmień: Ściągacz 1/1' });
    const up2 = within(change).getByRole('group', { name: 'W górę' });
    await user.click(within(up2).getByRole('radio', { name: 'Do końca wysokości' }));
    await user.click(within(change).getByRole('button', { name: 'Zapisz zmiany' }));
    await waitFor(() =>
      expect(pattern()?.design?.placements[0]).toMatchObject({ repeatY: 'fill' }),
    );
    expect(screen.getByRole('link', { name: 'Dziergaj' })).toHaveAttribute(
      'href',
      '/projekt/p1/wzor/pattern-1',
    );
  });
});
