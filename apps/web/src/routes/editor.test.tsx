import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { resetDraftForTests, useDraft } from '../state/draft';
import { setStorageForTests, useLibrary } from '../state/library';

beforeAll(() => {
  initI18n('pl');
});

beforeEach(() => {
  setStorageForTests(createMemoryStorage());
  useLibrary.setState({
    status: 'idle',
    patterns: [],
    projects: [],
    progress: {},
    persist: null,
    storageKind: null,
  });
  resetDraftForTests();
  navigate('/wzory', { replace: true });
});

describe('pattern editor screens', () => {
  it('creates a blank pattern, edits its basics and shows validation inline', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Nowy wzór' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mój wzór' })).toBeInTheDocument();
    expect(location.pathname).toMatch(/^\/wzor\/wzor-/);

    // Inline validation: an empty layout is an error, so a project can't start yet.
    expect(screen.getByText(/układ nie ma jeszcze oczek/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zacznij dziergać' })).toBeDisabled();

    // An empty title is refused next to the field and never saved.
    const title = screen.getByLabelText('Nazwa wzoru');
    await user.clear(title);
    expect(screen.getByText('To pole nie może być puste.')).toBeInTheDocument();
    expect(useDraft.getState().pattern?.title).toBe('Mój wzór');
    await user.type(title, 'Sweter próbny');
    expect(useDraft.getState().pattern?.title).toBe('Sweter próbny');

    // Sizes: add and rename.
    await user.click(screen.getByRole('button', { name: 'Dodaj rozmiar' }));
    expect(useDraft.getState().pattern?.sizes).toEqual(['jeden rozmiar', '2']);
    await user.click(screen.getByRole('button', { name: 'Usuń rozmiar 2' }));
    expect(useDraft.getState().pattern?.sizes).toEqual(['jeden rozmiar']);
  });

  it('adds a chart through the dialog and opens the chart editor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Nowy wzór' }));
    await screen.findByRole('heading', { level: 1, name: 'Mój wzór' });
    await user.click(screen.getByRole('button', { name: 'Dodaj schemat' }));
    const dialog = screen.getByRole('dialog', { name: 'Nowy schemat' });
    await user.type(within(dialog).getByLabelText('Nazwa schematu'), 'Ryż');
    await user.clear(within(dialog).getByLabelText('Szerokość (oczka)'));
    await user.type(within(dialog).getByLabelText('Szerokość (oczka)'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Utwórz i rysuj' }));
    await waitFor(() => expect(location.pathname).toMatch(/\/schemat\/ryz$/));
    expect(await screen.findByLabelText('Nazwa schematu')).toHaveValue('Ryż');
    expect(screen.getByText('2 × 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^lewe/ })).toBeInTheDocument();
    // The canvas can't draw in jsdom; the editor says so instead of crashing.
    expect(screen.getByText(/nie potrafi narysować siatki/)).toBeInTheDocument();
  });

  it('sets up a layout in the wizard and reports the stitch count', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Nowy wzór' }));
    await screen.findByRole('heading', { level: 1, name: 'Mój wzór' });
    useDraft.getState().update((p) => ({
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
    await user.click(screen.getByRole('link', { name: 'Ustaw układ' }));
    await screen.findByRole('heading', { level: 1, name: 'Układ: Korpus' });
    await user.selectOptions(screen.getByLabelText('Dodaj schemat'), 'a');
    await user.selectOptions(screen.getByLabelText('Dodaj schemat'), 'a');
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

    await user.click(screen.getByRole('link', { name: 'Gotowe' }));
    expect(await screen.findByRole('button', { name: 'Zacznij dziergać' })).toBeEnabled();
  });
});
