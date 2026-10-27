import { blankPattern, blankProject, insertPattern } from '@kt/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { useImport } from '../import/session';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { sampleProject } from '../sample/sampleProject';
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
  navigate('/', { replace: true });
});

const sample = () => sampleProject('s1', 'Przykład', '2026-10-22T10:00:00.000Z');

describe('screens', () => {
  it('invites to start on an empty device and warns when storage is not persistent', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Twoje projekty' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Zacznij pierwszy projekt' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nowy projekt/ })).toHaveAttribute('href', '/nowy');
    // Memory storage in tests → the permanent warning is shown.
    expect(screen.getByRole('alert')).toHaveTextContent('Postęp nie będzie zapisany.');
  });

  it('lists projects with their patterns and opens the project page', async () => {
    const user = userEvent.setup();
    await useLibrary.getState().addProject(sample());
    render(<App />);
    const link = await screen.findByRole('link', { name: /Przykład/ });
    expect(link).toHaveTextContent('2 wzory');
    expect(link).toHaveTextContent('Korpus');
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Przykład' })).toBeInTheDocument();
    const list = screen.getByTestId('pattern-list');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Ściągacz'), expect.stringContaining('Korpus')]);
    expect(screen.getByTestId('continue-knitting')).toHaveAttribute(
      'href',
      '/projekt/s1/wzor/body',
    );
  });

  it('new project: a name, two tiles, then the kind; the kind creates the project', async () => {
    const user = userEvent.setup();
    navigate('/nowy', { replace: true });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Nowy projekt' });
    expect(screen.getByLabelText(/Wgraj PDF z opisem projektu/)).toHaveAttribute(
      'accept',
      'application/pdf,.pdf',
    );
    await user.type(screen.getByLabelText('Nazwa projektu'), 'Sweter testowy');
    await user.click(screen.getByRole('button', { name: /Stwórz projekt/ }));

    // Step 2: nine kinds.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Co dziergasz?' }),
    ).toBeInTheDocument();
    expect(location.pathname).toBe('/nowy/rodzaj');
    expect(screen.getByText('Projekt: Sweter testowy')).toBeInTheDocument();
    const kinds = within(screen.getByRole('list', { name: 'Co dziergasz?' }));
    expect(kinds.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Sweter',
      'Kardigan',
      'Kamizelka',
      'Czapka',
      'Szalik',
      'Komin',
      'Rękawiczki',
      'Skarpetki',
      'Własny projekt',
    ]);
    // Back keeps the typed name.
    await user.click(screen.getByRole('link', { name: 'Nowy projekt' }));
    expect(await screen.findByLabelText('Nazwa projektu')).toHaveValue('Sweter testowy');
    await user.click(screen.getByRole('button', { name: /Stwórz projekt/ }));
    await user.click(await screen.findByRole('button', { name: 'Kardigan' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sweter testowy' }),
    ).toBeInTheDocument();
    // A garment opens split into its parts.
    expect(location.pathname).toMatch(/^\/projekt\/[^/]+\/czesci$/);
    expect(screen.getByText('Kardigan')).toBeInTheDocument();
    expect(screen.getByTestId('garment-diagram')).toBeInTheDocument();
    expect(useLibrary.getState().projects[0]).toMatchObject({
      name: 'Sweter testowy',
      kind: 'cardigan',
      patterns: [],
    });
    // The typed name is not offered again for the next project.
    navigate('/nowy');
    await screen.findByRole('heading', { level: 1, name: 'Nowy projekt' });
    expect(screen.getByLabelText('Nazwa projektu')).toHaveValue('');
  });

  it('without a typed name the kind names the project', async () => {
    const user = userEvent.setup();
    navigate('/nowy/rodzaj', { replace: true });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Skarpetki' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Skarpetki' })).toBeInTheDocument();
    navigate('/nowy/rodzaj');
    await user.click(await screen.findByRole('button', { name: 'Własny projekt' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mój projekt' }),
    ).toBeInTheDocument();
    // An own project has no fixed parts: it opens on the project page.
    expect(location.pathname).toMatch(/^\/projekt\/[^/]+$/);
  });

  it('a part of the garment creates its pattern and opens the pattern creator', async () => {
    const user = userEvent.setup();
    navigate('/nowy/rodzaj', { replace: true });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sweter' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Części' })).toBeInTheDocument();
    const parts = screen.getAllByRole('button', { name: /\+ stwórz wzór/ });
    expect(parts.map((b) => b.textContent)).toEqual([
      '11. Ściągacz dołu+ stwórz wzór',
      '22. Korpus+ stwórz wzór',
      '33. Karczek+ stwórz wzór',
      '44. Rękaw ×2+ stwórz wzór',
      '55. Ściągacz rękawa ×2+ stwórz wzór',
      '66. Dekolt / golf+ stwórz wzór',
    ]);
    const id = useLibrary.getState().projects[0]?.id ?? '';

    // The body asks how it is made; pieces make a back and a front.
    await user.click(screen.getByRole('button', { name: /Korpus/ }));
    await user.click(screen.getByRole('button', { name: 'Z osobnych części' }));
    await waitFor(() => expect(location.pathname).toBe(`/projekt/${id}/wzor/back/kreator`));

    navigate(`/projekt/${id}/czesci`);
    const body = await screen.findByRole('button', { name: /Korpus/ });
    expect(body).toHaveTextContent('wzór: Tył, Przód');
    // Clicking the sleeve in the drawing creates its pattern.
    const sleeve = screen.getByTestId('garment-diagram').querySelector('[data-part="sleeve"]');
    if (!sleeve) throw new Error('no sleeve');
    await user.click(sleeve);
    await waitFor(() => expect(location.pathname).toBe(`/projekt/${id}/wzor/sleeve/kreator`));
    await waitFor(() =>
      expect(
        useLibrary
          .getState()
          .project(id)
          ?.patterns.map((p) => p.name),
      ).toEqual(['Tył', 'Przód', 'Rękaw']),
    );
    // A part with a pattern opens it.
    navigate(`/projekt/${id}/czesci`);
    await user.click(await screen.findByRole('button', { name: /Korpus/ }));
    await waitFor(() => expect(location.pathname).toBe(`/projekt/${id}/wzor/back/kreator`));
  });

  it('the PDF tile refuses other files and keeps the typed name for the import', async () => {
    const user = userEvent.setup({ applyAccept: false });
    navigate('/nowy', { replace: true });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Nowy projekt' });
    const input = screen.getByLabelText(/Wgraj PDF z opisem projektu/);
    await user.upload(input, new File(['not a pdf'], 'opis.txt', { type: 'text/plain' }));
    expect(await screen.findByText('To nie jest plik PDF.')).toBeInTheDocument();
    expect(location.pathname).toBe('/nowy');

    // A PDF starts the import with the typed name (recognition itself needs a browser worker).
    await user.type(screen.getByLabelText('Nazwa projektu'), 'Sweter z PDF');
    await user.upload(input, new File(['%PDF-1.7 synthetic'], 'opis.pdf'));
    await waitFor(() => expect(location.pathname).toBe('/import'));
    expect(useImport.getState().projectName).toBe('Sweter z PDF');
    expect(useImport.getState().file?.name).toBe('opis.pdf');
  });

  it('shows which parts are ready, takes a ✓ off, and starts knitting after a warning', async () => {
    const user = userEvent.setup();
    let project = blankProject({
      id: 'sw',
      name: 'Sweter',
      kind: 'sweater',
      sizes: ['M'],
      now: '2026-10-25T10:00:00.000Z',
    });
    project = insertPattern(project, {
      ...blankPattern('bottom-rib', 'Ściągacz dołu'),
      ready: true,
    }).project;
    project = insertPattern(project, blankPattern('body', 'Korpus')).project;
    await useLibrary.getState().addProject(project);
    navigate('/projekt/sw/czesci');
    render(<App />);
    const row = async (part: string) => {
      await screen.findByText(/Gotowe części/);
      const el = document.querySelector(`.track-item[data-part="${part}"]`);
      if (!el) throw new Error(part);
      return el;
    };
    expect(await row('bottom-rib')).toHaveTextContent('gotowa');
    expect(await row('body')).toHaveTextContent('do ustawienia');
    expect(await row('sleeve')).not.toHaveTextContent(/gotowa|do ustawienia/);
    expect(screen.getByText('Gotowe części: 1 z 2')).toBeInTheDocument();
    expect(
      screen.getByText('Dzierganie zacznie się od części „Ściągacz dołu”.'),
    ).toBeInTheDocument();

    // Not everything is ready: a warning lists what is left.
    await user.click(screen.getByRole('button', { name: 'Konfiguracja gotowa — dziergaj' }));
    const warning = screen.getByRole('dialog', { name: 'Nie wszystkie części są gotowe' });
    expect(within(warning).getByRole('list')).toHaveTextContent('2. Korpus');
    await user.click(within(warning).getByRole('button', { name: 'Wróć do części' }));
    expect(location.pathname).toBe('/projekt/sw/czesci');

    await user.click(screen.getByRole('button', { name: 'Zdejmij ✓ z części „Ściągacz dołu”' }));
    expect(await screen.findByText('Gotowe części: 0 z 2')).toBeInTheDocument();
    expect(await row('bottom-rib')).toHaveTextContent('do ustawienia');

    await user.click(screen.getByRole('button', { name: 'Konfiguracja gotowa — dziergaj' }));
    await user.click(screen.getByRole('button', { name: 'Dziergaj mimo to' }));
    await waitFor(() => expect(location.pathname).toBe('/projekt/sw/wzor/bottom-rib'));
  });

  it('a row counter part is done with one button that goes on to the next part', async () => {
    const user = userEvent.setup();
    let project = blankProject({
      id: 'rib',
      name: 'Sweter',
      kind: 'sweater',
      sizes: ['M'],
      now: '2026-10-26T10:00:00.000Z',
    });
    // The parts the knitter tracks, in knitting order: the sleeves were left out.
    for (const [id, name] of [
      ['bottom-rib', 'Ściągacz dołu'],
      ['body', 'Korpus'],
    ] as const) {
      project = insertPattern(project, { ...blankPattern(id, name), tracking: 'rows' }).project;
    }
    await useLibrary.getState().addProject(project);
    navigate('/projekt/rib/wzor/bottom-rib');
    render(<App />);
    const plus = await screen.findByRole('button', { name: 'Dodaj rząd' });
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByText('Zakończy tę część i przejdzie do: Korpus.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Gotowe: Ściągacz dołu' }));
    await waitFor(() => expect(location.pathname).toBe('/projekt/rib/wzor/body'));
    expect(useLibrary.getState().project('rib')?.finishedRows).toEqual({ 'bottom-rib': 2 });
    expect(
      await screen.findByText('Zakończy tę część — to ostatnia w projekcie.'),
    ).toBeInTheDocument();
  });

  it('the chart tracker has a Gotowe button in the bottom bar that finishes the part', async () => {
    const user = userEvent.setup();
    await useLibrary.getState().addProject(sample());
    navigate('/projekt/s1/wzor/body');
    render(<App />);
    await user.click(await screen.findByTitle('Zakończ tę część i przejdź do następnej'));
    const dialog = screen.getByRole('dialog', { name: 'Zakończyć wzór „Korpus”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Zakończ wzór' }));
    await waitFor(() =>
      expect(useLibrary.getState().project('s1')?.finishedRows).toHaveProperty('body'),
    );
    expect(screen.queryByTitle('Zakończ tę część i przejdź do następnej')).toBeNull();
  });

  it('a finished project is marked done and can be knitted again after a warning', async () => {
    const user = userEvent.setup();
    let project = blankProject({
      id: 'done',
      name: 'Czapka',
      kind: 'hat',
      sizes: ['M'],
      now: '2026-10-26T10:00:00.000Z',
    });
    for (const [id, name] of [
      ['rib', 'Ściągacz'],
      ['crown', 'Denko'],
    ] as const) {
      project = insertPattern(project, { ...blankPattern(id, name), tracking: 'rows' }).project;
    }
    await useLibrary
      .getState()
      .addProject({ ...project, activePatternId: 'crown', finishedRows: { rib: 8, crown: 12 } });
    render(<App />);
    const row = (await screen.findByRole('link', { name: /Czapka/ })).closest('li') as HTMLElement;
    expect(row).toHaveClass('project--done');
    expect(within(row).getByText('Gotowy')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Zrób jeszcze raz' }));
    const dialog = screen.getByRole('dialog', { name: 'Zrobić „Czapka” jeszcze raz?' });
    expect(dialog).toHaveTextContent('Postęp wszystkich części zostanie wyzerowany');
    await user.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    expect(useLibrary.getState().project('done')?.finishedRows).toEqual({ rib: 8, crown: 12 });

    await user.click(within(row).getByRole('button', { name: 'Zrób jeszcze raz' }));
    await user.click(screen.getByRole('button', { name: 'Wyzeruj i zacznij od nowa' }));
    await waitFor(() => expect(location.pathname).toBe('/projekt/done/wzor/rib'));
    const fresh = useLibrary.getState().project('done');
    expect(fresh?.finishedRows).toBeUndefined();
    expect(fresh?.activePatternId).toBe('rib');
  });
});
