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

const bar = () => screen.getByRole('region', { name: 'Kafelek' });
const group = (name: string) => within(bar()).getByRole('group', { name });

describe('pattern creator', () => {
  it('lays pieces as tiles that never overlap and stretches them in whole repeats', async () => {
    const user = userEvent.setup();
    navigate(paths.designer('p1', 'pattern-1'), { replace: true });
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kreator wzoru: Korpus' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Szerokość (oczka)'), '226');
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), '20');
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));

    // Lay the rib in the bottom right corner, then make it 113 repeats wide and 2 rows high.
    await user.click(await screen.findByRole('button', { name: /Ściągacz 1\/1/ }));
    expect(within(bar()).getByText('Kładziesz: Ściągacz 1/1')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Połóż' }));
    expect(within(bar()).getByText('Ściągacz 1/1')).toBeInTheDocument();
    expect(within(group('Szerokość')).getByText('1 × 2 = 2 oczka')).toBeInTheDocument();
    const times = within(group('Szerokość')).getByLabelText('Ile razy');
    await user.clear(times);
    await user.type(times, '113');
    expect(within(group('Szerokość')).getByText('113 × 2 = 226 oczek')).toBeInTheDocument();
    // The width can't grow past the grid's edge.
    expect(
      within(group('Szerokość')).getByRole('button', {
        name: 'Szerokość: o jedno powtórzenie więcej',
      }),
    ).toBeDisabled();
    await user.click(
      within(group('Wysokość')).getByRole('button', {
        name: 'Wysokość: o jedno powtórzenie więcej',
      }),
    );
    expect(within(group('Wysokość')).getByText('2 × 1 = 2 rzędy')).toBeInTheDocument();

    // A cable can't lie on the rib; above it, it can, and it stretches to the edge.
    await user.click(screen.getByRole('button', { name: /Warkocz 2\/2 w lewo/ }));
    await user.click(within(bar()).getByRole('button', { name: 'Połóż' }));
    expect(within(bar()).getByRole('status')).toHaveTextContent(
      'Tu się nie zmieści — kafelek wszedłby na „Ściągacz 1/1”.',
    );
    const row = within(bar()).getByLabelText('Rząd od dołu');
    await user.clear(row);
    await user.type(row, '3');
    await user.click(within(bar()).getByRole('button', { name: 'Połóż' }));
    expect(within(bar()).getByText('Warkocz 2/2 w lewo')).toBeInTheDocument();
    await user.click(
      within(group('Szerokość')).getByRole('checkbox', { name: 'Do końca szerokości' }),
    );
    expect(within(group('Szerokość')).getByText('37,67 × 6 = 226 oczek')).toBeInTheDocument();
    await user.click(
      within(group('Wysokość')).getByRole('checkbox', { name: 'Do końca wysokości' }),
    );
    expect(within(group('Wysokość')).getByText('4,5 × 4 = 18 rzędów')).toBeInTheDocument();

    // Moving it down onto the rib is refused; the tile stays where it was.
    const at = within(bar()).getByLabelText('Rząd od dołu');
    await user.clear(at);
    await user.type(at, '2');
    expect(within(bar()).getByRole('status')).toHaveTextContent(
      'kafelek wszedłby na „Ściągacz 1/1”',
    );
    await waitFor(() => expect(pattern()?.design?.placements[1]).toMatchObject({ row: 3 }));

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
    const p = pattern();
    expect(p?.rows).toBe(20);
    const grid = p?.charts[0] ? chartToSymbolRows(p.charts[0]) : [];
    expect(grid[0]?.filter((id) => id === 'std:p')).toHaveLength(113);
    expect(grid[4]?.filter((id) => id === 'cable:2-2-lc')).toHaveLength(37);

    // Picking a tile from the list selects it in the bar; it can be removed there.
    await user.click(within(placed).getByRole('button', { name: /^Ściągacz 1\/1/ }));
    expect(within(bar()).getByText('Ściągacz 1/1')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Usuń kafelek' }));
    await waitFor(() => expect(pattern()?.design?.placements).toHaveLength(1));
    expect(screen.getByRole('link', { name: 'Dziergaj' })).toHaveAttribute(
      'href',
      '/projekt/p1/wzor/pattern-1',
    );
  });
});
