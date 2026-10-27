import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { resetDraftForTests, useDraft } from '../state/draft';
import { setStorageForTests, useLibrary } from '../state/library';
import { useNewProject } from '../state/newProject';

beforeAll(() => {
  initI18n('pl');
});

beforeEach(() => {
  setStorageForTests(createMemoryStorage());
  useNewProject.setState({ name: '' });
  useLibrary.setState({
    status: 'idle',
    projects: [],
    progress: {},
    persist: null,
    storageKind: null,
  });
  resetDraftForTests();
  navigate('/nowy', { replace: true });
});

const pattern = () => useDraft.getState().project?.patterns[0];

/**
 * "Stwórz projekt", then "Dodaj wzór" Korpus: the new pattern opens in the creator; these tests
 * then go on in the pattern editor of the empty pattern.
 */
async function startFromScratch(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(await screen.findByRole('button', { name: /Stwórz projekt/ }));
  await user.click(await screen.findByRole('button', { name: 'Własny projekt' }));
  await user.click(await screen.findByRole('button', { name: 'Zaczynam' }));
  await screen.findByRole('heading', { level: 1, name: 'Mój projekt' });
  await user.click(screen.getByRole('button', { name: 'Dodaj wzór' }));
  const dialog = screen.getByRole('dialog', { name: 'Nowy wzór' });
  await user.type(within(dialog).getByLabelText('Nazwa wzoru'), 'Korpus');
  await user.click(within(dialog).getByRole('button', { name: 'Utwórz wzór' }));
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Kreator wzoru: Korpus' }),
  ).toBeInTheDocument();
  expect(location.pathname).toMatch(/^\/projekt\/[^/]+\/wzor\/korpus\/kreator$/);
  navigate(location.pathname.replace(/kreator$/, 'edycja'));
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Wzór: Korpus' }),
  ).toBeInTheDocument();
}

describe('project and pattern editor screens', () => {
  it('starts from scratch, shows validation inline and edits the project', async () => {
    const user = userEvent.setup();
    await startFromScratch(user);

    // Inline validation: an empty layout is an error, so knitting can't start yet.
    expect(screen.getByText(/układ nie ma jeszcze oczek/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gotowe' })).toBeDisabled();

    // An empty name is refused next to the field and never saved.
    const name = screen.getByLabelText('Nazwa wzoru');
    await user.clear(name);
    expect(screen.getByText('To pole nie może być puste.')).toBeInTheDocument();
    expect(pattern()?.name).toBe('Korpus');
    await user.type(name, 'Przód i tył');
    expect(pattern()?.name).toBe('Przód i tył');

    // The project page: name, sizes and the list of patterns.
    await user.click(screen.getByRole('link', { name: 'Mój projekt' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mój projekt' }),
    ).toBeInTheDocument();
    const list = screen.getByTestId('pattern-list');
    expect(within(list).getByText('Przód i tył')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dodaj rozmiar' }));
    expect(useDraft.getState().project?.sizes).toEqual(['jeden rozmiar', '2']);
    await user.selectOptions(screen.getByLabelText('Dziergasz rozmiar'), '1');
    expect(useDraft.getState().project?.sizeIndex).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Usuń rozmiar 2' }));
    expect(useDraft.getState().project?.sizes).toEqual(['jeden rozmiar']);
    expect(useDraft.getState().project?.sizeIndex).toBe(0);
  });

  it('adds a pattern to the project and removes one', async () => {
    const user = userEvent.setup();
    await startFromScratch(user);
    await user.click(screen.getByRole('link', { name: 'Mój projekt' }));
    await screen.findByRole('heading', { level: 1, name: 'Mój projekt' });
    await user.click(screen.getByRole('button', { name: 'Dodaj wzór' }));
    const dialog = screen.getByRole('dialog', { name: 'Nowy wzór' });
    await user.type(within(dialog).getByLabelText('Nazwa wzoru'), 'Rękaw');
    await user.click(within(dialog).getByRole('button', { name: 'Utwórz wzór' }));
    // A new pattern opens in the creator.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kreator wzoru: Rękaw' }),
    ).toBeInTheDocument();
    expect(useDraft.getState().project?.patterns.map((p) => p.id)).toEqual(['korpus', 'rekaw']);

    await user.click(screen.getByRole('link', { name: 'Projekt' }));
    await screen.findByRole('heading', { level: 1, name: 'Mój projekt' });
    await user.click(screen.getByRole('button', { name: 'Usuń wzór Korpus' }));
    const confirm = screen.getByRole('dialog', { name: 'Usunąć wzór „Korpus”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Usuń wzór' }));
    await waitFor(() =>
      expect(useDraft.getState().project?.patterns.map((p) => p.id)).toEqual(['rekaw']),
    );
    expect(useLibrary.getState().projects[0]?.patterns.map((p) => p.id)).toEqual(['rekaw']);
  });

  it('adds a chart through the dialog and opens the chart editor', async () => {
    const user = userEvent.setup();
    await startFromScratch(user);
    await user.click(screen.getByRole('button', { name: 'Dodaj schemat' }));
    const dialog = screen.getByRole('dialog', { name: 'Nowy schemat' });
    await user.type(within(dialog).getByLabelText('Nazwa schematu'), 'Ryż');
    await user.clear(within(dialog).getByLabelText('Szerokość (oczka)'));
    await user.type(within(dialog).getByLabelText('Szerokość (oczka)'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Utwórz i rysuj' }));
    await waitFor(() => expect(location.pathname).toMatch(/\/wzor\/korpus\/schemat\/ryz$/));
    // The chart editor loads on demand.
    await screen.findByRole('heading', { level: 1, name: 'Edytor schematu Ryż' });
    expect(screen.getByLabelText('Nazwa schematu')).toHaveValue('Ryż');
    expect(screen.getByText('2 × 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^lewe/ })).toBeInTheDocument();
    // The canvas can't draw in jsdom; the editor says so instead of crashing.
    expect(screen.getByText(/nie potrafi narysować siatki/)).toBeInTheDocument();
  });

  it('sets up a layout and reports the stitch count', async () => {
    const user = userEvent.setup();
    await startFromScratch(user);
    useDraft.getState().updatePattern('korpus', (p) => ({
      ...p,
      charts: [
        {
          id: 'a',
          name: 'A',
          width: 4,
          height: 2,
          palette: { k: 'std:k' },
          rows: ['kkkk', 'kkkk'],
        },
      ],
    }));
    await user.selectOptions(await screen.findByLabelText('Dodaj schemat do układu'), 'a');
    await user.selectOptions(screen.getByLabelText('Dodaj schemat do układu'), 'a');
    const second = screen
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('segment'))[2];
    if (!second) throw new Error('segment missing');
    await user.click(within(second).getByLabelText(/Na innej liczbie oczek/));
    const count = within(second).getByRole('textbox', { name: 'Liczba oczek' });
    await user.clear(count);
    await user.type(count, '6');
    expect(within(second).getByText('oczka 5–10')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Wzór podaje liczbę oczek'));
    const expected = screen.getByRole('textbox', { name: 'Oczka wg wzoru' });
    await user.clear(expected);
    await user.type(expected, '11');
    expect(await screen.findByText(/układ ma 10 oczek, a wzór podaje 11/)).toBeInTheDocument();
    await user.clear(expected);
    await user.type(expected, '10');
    expect(await screen.findByText('Wszystko się zgadza.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gotowe' })).toBeEnabled();

    // "I knit it in plain knit" keeps the chart and changes the grid.
    await user.click(screen.getByLabelText('Przerabiam samymi prawymi'));
    expect(pattern()?.modifications?.map((m) => m.chartId)).toEqual(['a']);
    await user.click(screen.getByLabelText('Przerabiam samymi prawymi'));
    expect(pattern()?.modifications).toBeUndefined();
  });
});
