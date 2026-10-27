import {
  applyDesign,
  blankDesign,
  blankPattern,
  blankProject,
  createRegistry,
  insertPattern,
  MOTIF_LIBRARY,
  resolvePattern,
  type Design,
} from '@kt/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { setStorageForTests, useLibrary } from '../state/library';

const lib = (id: string) => {
  const m = MOTIF_LIBRARY.find((x) => x.chart.id === `lib:${id}`);
  if (!m) throw new Error(id);
  return m.chart;
};

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
  // A sweater drawn in one size: the body (40 stitches, rib to the edge, a cable and 4 purl
  // stitches on the front) and a cuff counted in rows.
  const body: Design = {
    ...blankDesign(40, 6),
    motifs: [lib('rib-1-1'), lib('cable-2-2-left'), lib('purl')],
    placements: [
      { id: 'rib', motifId: 'lib:rib-1-1', col: 1, row: 1, repeatX: 'fill', repeatY: 2 },
      { id: 'cable', motifId: 'lib:cable-2-2-left', col: 9, row: 3, repeatX: 1, repeatY: 'fill' },
      { id: 'purl', motifId: 'lib:purl', col: 3, row: 3, repeatX: 4, repeatY: 'fill' },
    ],
    halves: ['Przód', 'Tył'],
  };
  let project = blankProject({
    id: 'sw',
    name: 'Sweter',
    kind: 'sweater',
    sizes: ['jeden rozmiar'],
    now: '2026-10-27T12:00:00.000Z',
  });
  const registry = createRegistry();
  project = insertPattern(
    project,
    applyDesign({ ...blankPattern('body', 'Korpus'), design: body }, registry),
  ).project;
  project = insertPattern(project, {
    ...blankPattern('sleeve-cuff', 'Ściągacz rękawa'),
    tracking: 'rows',
    rows: 10,
  }).project;
  await useLibrary.getState().addProject(project);
});

describe('project sizes', () => {
  it('declares the sizes and what changes in each, part by part, as drawn by default', async () => {
    const user = userEvent.setup();
    navigate('/projekt/sw/rozmiary', { replace: true });
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rozmiary projektu' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rozmiary'), 'S - M - L');
    // Which size the parts were drawn in is asked, not guessed.
    expect(screen.getByRole('button', { name: 'Zapisz rozmiary' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Części są zaprojektowane w rozmiarze'), 'M');

    const body = within(screen.getByRole('region', { name: 'Korpus' }));
    expect(
      body
        .getAllByRole('row')
        .map((r) => r.querySelector('th')?.textContent)
        .slice(1),
    ).toEqual([
      'Szerokość (oczka)',
      'Wysokość (rzędy)',
      '„Warkocz 2/2 w lewo” — powtórzenia w poziomiepo 6 oczek',
      '„Lewe oczka” — powtórzenia w poziomiepo 1 oczku',
    ]);
    expect(body.getByText(/Do brzegu siatki idą: Ściągacz 1\/1/)).toBeInTheDocument();
    // The drawn size is shown as drawn; the others show it as a placeholder.
    const width = body.getByLabelText('Szerokość (oczka), rozmiar L');
    expect(width).toHaveAttribute('placeholder', '40');
    expect(body.queryByLabelText('Szerokość (oczka), rozmiar M')).toBeNull();

    await user.type(width, '48');
    await user.type(body.getByLabelText('Szerokość (oczka), rozmiar S'), '32');
    await user.type(body.getByLabelText('Wysokość (rzędy), rozmiar L'), '8');
    await user.type(body.getByLabelText('„Lewe oczka” — powtórzenia w poziomie, rozmiar L'), '6');
    const cuff = within(screen.getByRole('region', { name: 'Ściągacz rękawa' }));
    await user.type(cuff.getByLabelText('Rzędy, rozmiar L'), '12');
    // A typo is shown and blocks saving.
    await user.type(cuff.getByLabelText('Rzędy, rozmiar S'), 'x');
    expect(cuff.getByLabelText('Rzędy, rozmiar S')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Zapisz rozmiary' })).toBeDisabled();
    await user.clear(cuff.getByLabelText('Rzędy, rozmiar S'));

    await user.click(screen.getByRole('button', { name: 'Zapisz rozmiary' }));
    await waitFor(() => expect(location.pathname).toBe('/projekt/sw/czesci'));
    const project = useLibrary.getState().project('sw');
    expect(project?.sizes).toEqual(['S', 'M', 'L']);
    expect(project?.sizeIndex).toBe(1);
    const design = project?.patterns.find((p) => p.id === 'body')?.design;
    expect(design?.sizes).toEqual({
      base: 1,
      width: [32, null, 48],
      height: [null, null, 8],
      repeats: [{ placementId: 'purl', values: [null, null, 6] }],
    });
    expect(project?.patterns.find((p) => p.id === 'sleeve-cuff')?.rows).toEqual([10, 10, 12]);
    // Every size can be knitted: the tracker composes it from the drawn grid.
    if (!project) throw new Error('no project');
    expect(
      [0, 1, 2].map((i) => {
        const g = resolvePattern(project, 'body', { sizeIndex: i });
        return [g.stitchCount, g.plannedRows];
      }),
    ).toEqual([
      [32, 6],
      [40, 6],
      [48, 8],
    ]);

    // Back on the parts page: the sizes are listed; opening the table again shows the numbers.
    expect(await screen.findByText('S – M – L')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Zmień rozmiary' }));
    const again = within(await screen.findByRole('region', { name: 'Korpus' }));
    expect(again.getByLabelText('Szerokość (oczka), rozmiar L')).toHaveValue('48');
    expect(screen.getByLabelText('Części są zaprojektowane w rozmiarze')).toHaveValue('M');
  });

  it('warns when tiles would overlap in a size', async () => {
    const user = userEvent.setup();
    navigate('/projekt/sw/rozmiary', { replace: true });
    render(<App />);
    await user.type(await screen.findByLabelText('Rozmiary'), 'M, XL');
    await user.selectOptions(screen.getByLabelText('Części są zaprojektowane w rozmiarze'), 'M');
    const body = within(screen.getByRole('region', { name: 'Korpus' }));
    await user.type(body.getByLabelText('„Lewe oczka” — powtórzenia w poziomie, rozmiar XL'), '12');
    expect(
      body.getByText(
        'Rozmiar XL: „Lewe oczka” nachodzi na „Warkocz 2/2 w lewo”. Zmień szerokość albo powtórzenia.',
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument();
  });
});
