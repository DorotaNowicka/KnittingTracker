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
const width = () => within(bar()).getByRole('group', { name: 'Szerokość kafelka' });

describe('pattern creator', () => {
  it('lays tiles on the bottom row and sets their width as repeats × piece = stitches', async () => {
    const user = userEvent.setup();
    navigate(paths.designer('p1', 'pattern-1'), { replace: true });
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kreator wzoru: Korpus' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Szerokość (oczka)'), '240');
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), '20');
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));

    // A rib laid in the first free place: one repeat, standing on the bottom row.
    await user.click(await screen.findByRole('button', { name: /Ściągacz 1\/1/ }));
    expect(within(bar()).getByText('Kładziesz: Ściągacz 1/1')).toBeInTheDocument();
    await user.click(
      within(bar()).getByRole('button', { name: 'Połóż w pierwszym wolnym miejscu' }),
    );
    expect(within(bar()).getByText('powtarza się w górę co 1 rząd')).toBeInTheDocument();
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('1');
    expect(within(width()).getByText('2 oczka')).toBeInTheDocument();
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('2');

    // Typing the repeats recalculates the stitches…
    const times = within(width()).getByLabelText('Ile razy');
    await user.clear(times);
    await user.type(times, '113{Enter}');
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('226');
    // …and typing the stitches recalculates the repeats, down to whole ones.
    const stitches = within(width()).getByLabelText('Szerokość w oczkach');
    await user.clear(stitches);
    await user.type(stitches, '101{Enter}');
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('50');
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('100');
    await user.click(within(width()).getByRole('button', { name: 'O jedno powtórzenie więcej' }));
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('102');

    // A cable next to it: the first free place is stitch 103; it repeats up by its own height.
    await user.click(screen.getByRole('button', { name: /Warkocz 2\/2 w lewo/ }));
    await user.click(
      within(bar()).getByRole('button', { name: 'Połóż w pierwszym wolnym miejscu' }),
    );
    expect(within(bar()).getByText('powtarza się w górę co 4 rzędy')).toBeInTheDocument();
    await user.click(within(width()).getByRole('button', { name: 'Do końca' }));
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('23');
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('138');
    expect(
      within(width()).getByRole('button', { name: 'O jedno powtórzenie więcej' }),
    ).toBeDisabled();

    // The rib can't grow into the cable.
    const placed = screen.getByRole('region', { name: 'Na siatce' });
    await user.click(within(placed).getByRole('button', { name: /^Ściągacz 1\/1/ }));
    const ribTimes = within(width()).getByLabelText('Ile razy');
    await user.clear(ribTimes);
    await user.type(ribTimes, '60{Enter}');
    expect(within(bar()).getByRole('status')).toHaveTextContent(
      'Tu się nie zmieści — kafelek wszedłby na „Warkocz 2/2 w lewo”.',
    );
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('51');
    expect(
      within(placed)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('Ściągacz 1/1od oczka 1 · 51 × 2 = 102 oczka'),
      expect.stringContaining('Warkocz 2/2 w lewood oczka 103 · 23 × 6 = 138 oczek'),
    ]);
    await waitFor(() => expect(pattern()?.design?.placements).toHaveLength(2));
    const p = pattern();
    expect(p?.design?.placements.every((x) => x.row === 1 && x.repeatY === 'fill')).toBe(true);
    const grid = p?.charts[0] ? chartToSymbolRows(p.charts[0]) : [];
    expect(grid).toHaveLength(20);
    // The rib is purl in every row; the cable crosses on every 4th row (rows 3, 7, 11…).
    expect(grid.map((r) => r.filter((id) => id === 'std:p').length >= 51)).toEqual(
      Array(20).fill(true),
    );
    expect(grid.map((r) => r.filter((id) => id === 'cable:2-2-lc').length)).toEqual([
      0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 23, 0,
    ]);

    await user.click(within(bar()).getByRole('button', { name: 'Usuń kafelek' }));
    await waitFor(() => expect(pattern()?.design?.placements).toHaveLength(1));
    expect(screen.getByRole('link', { name: 'Dziergaj' })).toHaveAttribute(
      'href',
      '/projekt/p1/wzor/pattern-1',
    );
  });
});
