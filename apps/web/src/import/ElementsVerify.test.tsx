import { parseDescription, type ImportResult } from '@kt/importer';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { setStorageForTests, useLibrary } from '../state/library';
import { initialElements } from './elements';
import { draftOf, useImport } from './session';

const cell = (symbolId: string) => ({
  symbolId,
  part: 0,
  width: 1,
  confidence: 0.95,
  candidates: [{ value: symbolId, score: 0.95 }],
});
const recognized = {
  cols: 2,
  rows: 2,
  cells: [
    [cell('std:k'), cell('std:p')],
    [cell('std:p'), cell('std:k')],
  ],
};
const chart = (name: string) => ({
  source: 0,
  name,
  grid: {
    xs: [],
    ys: [],
    cols: 2,
    rows: 2,
    pitch: 10,
    box: { x: 0, y: 0, w: 20, h: 20 },
    regularity: 1,
  },
  recognized,
  view: { x: 0, y: 0, w: 20, h: 20 },
});
const text = 'Sweter Jesienny\nROZMIARY: S - M\nRękawy: nabierz oczka.';
const result: ImportResult = {
  kind: 'pdf',
  sources: [],
  charts: [chart('A.1'), chart('A.2')],
  legend: [],
  symbols: ['std:k', 'std:p'],
  text,
  description: parseDescription(text),
  notes: [],
};

beforeAll(() => {
  initI18n('pl');
});

beforeEach(() => {
  setStorageForTests(createMemoryStorage());
  useLibrary.setState({
    status: 'idle',
    projects: [],
    progress: {},
    persist: null,
    storageKind: null,
  });
  useImport.getState().reset();
  useImport.setState({
    status: 'verify',
    file: { kind: 'pdf', name: 'sweter-jesienny.pdf', bytes: new ArrayBuffer(0) },
    result,
    charts: result.charts.map((c) => draftOf(c.recognized, c.name ?? '')),
    legend: [],
    description: { text, parsed: result.description },
    guess: { kind: 'sweater', confidence: 0.9, evidence: ['Sweter', 'Rękawy'] },
    projectKind: 'sweater',
    elements: initialElements('sweater', 2),
    order: {
      order: ['bottom-rib', 'sleeve', 'yoke', 'body', 'sleeve-cuff', 'neck'],
      source: 'headings',
      evidence: ['Rękawy', 'Korpus'],
    },
    step: 'parts',
    sizes: ['S', 'M'],
    sizeIndex: 1,
    projectName: 'Mój sweter',
  });
  navigate('/import', { replace: true });
});

const toPreview = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /^Dalej/ }));
  return screen.findByRole('button', { name: /^Zgadza się/ });
};

/** Say "Zgadza się" to every part in turn; the last one starts the project. */
const agreeAll = async (user: ReturnType<typeof userEvent.setup>) => {
  for (let i = 0; i < 10; i++) {
    const next = screen.queryByRole('button', { name: 'Zgadza się, następna' });
    if (!next) break;
    await user.click(next);
  }
  await user.click(screen.getByRole('button', { name: 'Zgadza się, zaczynam' }));
};

const tab = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Części do podglądu' })).getByRole('button', { name });

describe('new project from a PDF: parts to track', () => {
  it('lets the knitter fix a wrongly recognised order with the arrows', async () => {
    const user = userEvent.setup();
    render(<App />);
    const list = await screen.findByRole('group', { name: 'Co chcesz śledzić?' });
    const labels = () =>
      within(list)
        .getAllByRole('checkbox')
        .map((c) => c.closest('label')?.textContent);
    expect(
      screen.getByRole('button', { name: 'Ściągacz dołu — wcześniej w kolejności' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Korpus — wcześniej w kolejności' }));
    await user.click(screen.getByRole('button', { name: 'Korpus — wcześniej w kolejności' }));
    expect(labels().slice(0, 3)).toEqual(['11. Ściągacz dołu', '22. Korpus', '33. Rękaw ×2']);
    expect(screen.getByText('Kolejność ustawiona przez Ciebie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Korpus — później w kolejności' }));
    expect(labels()[1]).toBe('22. Rękaw ×2');
  });

  it('shows the recognised kind as a drawing with parts numbered in knitting order', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Sweter' })).toBeInTheDocument();
    expect(screen.getByLabelText('Zmień rodzaj')).toHaveValue('sweater');
    expect(screen.getByText(/Rozpoznaliśmy po słowach: Sweter, Rękawy/)).toBeInTheDocument();
    expect(
      screen.getByText('Kolejność według nagłówków w opisie: Rękawy, Korpus.'),
    ).toBeInTheDocument();
    const list = screen.getByRole('group', { name: 'Co chcesz śledzić?' });
    expect(
      within(list)
        .getAllByRole('checkbox')
        .map((c) => [c.closest('label')?.textContent, (c as HTMLInputElement).checked]),
    ).toEqual([
      ['11. Ściągacz dołu', true],
      ['22. Rękaw ×2', true],
      ['33. Karczeknie w każdym wzorze', false],
      ['44. Korpus', true],
      ['55. Ściągacz rękawa ×2', true],
      ['66. Dekolt / golf', true],
    ]);
    const marks = screen.getByTestId('garment-diagram').querySelectorAll('[data-mark="sleeve"]');
    expect([...marks].map((m) => m.textContent)).toEqual(['2', '2']);
    expect(screen.getByRole('button', { name: 'Dalej: 5 części' })).toBeEnabled();
  });

  it('tracks a part by clicking it in the drawing, and highlights it in the list', async () => {
    const user = userEvent.setup();
    render(<App />);
    const yoke = (await screen.findByTestId('garment-diagram')).querySelector('[data-part="yoke"]');
    if (!yoke) throw new Error('no yoke');
    await user.hover(yoke);
    expect(screen.getByRole('checkbox', { name: /Karczek/ }).closest('label')).toHaveClass(
      'is-hover',
    );
    await user.click(yoke);
    expect(screen.getByRole('checkbox', { name: /Karczek/ })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Dekolt/ }));
    expect(screen.getByTestId('garment-diagram').querySelector('[data-part="neck"]')).toHaveClass(
      'is-off',
    );
    expect(screen.getByRole('button', { name: 'Dalej: 5 części' })).toBeEnabled();
    for (const name of [/Ściągacz dołu/, /Rękaw ×2/, /Karczek/, /Korpus/, /Ściągacz rękawa/]) {
      await user.click(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByRole('button', { name: 'Dalej: 0 części' })).toBeDisabled();
  });

  it('previews the grid of the main part, built from the charts, at the chosen size', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /Dekolt/ }));
    await toPreview(user);
    // The check starts with the lowest number.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '1Ściągacz dołu — rozmiar M',
    );
    await user.click(tab(/Korpus/));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('4Korpus — rozmiar M');
    expect(screen.getByText('4 oczka w okrążeniu')).toBeInTheDocument();
    expect(
      screen.getByText('A.1 · A.2 — obok siebie (opis nie podaje ułożenia)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Wzór powtarza się co 2 okrążenia')).toBeInTheDocument();
    expect(document.querySelector('.stage-preview')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Części do podglądu' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['1Ściągacz dołu', '2Rękaw', '4Korpus', '5Ściągacz rękawa']);
    // Nothing is stored before the knitter agrees.
    expect(useLibrary.getState().projects).toHaveLength(0);

    await user.click(tab(/Rękaw$/));
    expect(screen.getByText(/Ta część nie ma schematu/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pomiń tę część' }));
    // The next part shows.
    expect(tab(/Korpus/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Rękaw$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Powstaną 3 wzory/)).toBeInTheDocument();
  });

  it('corrects a part before starting: charts, how it is made, name; then creates the project', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toPreview(user);
    await user.click(tab(/Rękaw$/));
    await user.click(screen.getByRole('button', { name: 'Popraw' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Popraw: Rękaw' })).toBeInTheDocument();
    // The sleeve has no chart yet: one click puts A.2 in its round.
    await user.click(
      within(screen.getByRole('group', { name: 'Dodaj schemat' })).getByRole('button', {
        name: /A\.2/,
      }),
    );
    expect(screen.getByText('✓ Schematy wypełniają całe okrążenie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wróć do podglądu' }));
    expect(screen.getByText('2 oczka w okrążeniu')).toBeInTheDocument();

    await user.click(tab(/Korpus/));
    await user.click(screen.getByRole('button', { name: 'Popraw' }));
    await user.click(screen.getByText('Jak powstaje?'));
    await user.click(screen.getByRole('radio', { name: /osobnych/ }));
    await user.click(screen.getByText('Nazwa projektu', { selector: 'b' }));
    const name = screen.getByLabelText(/Nazwa projektu/);
    await user.clear(name);
    await user.type(name, 'Jesienny');
    await user.click(screen.getByRole('button', { name: 'Wróć do podglądu' }));
    expect(tab(/Tył/)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(/Przód/)).toBeInTheDocument();

    await agreeAll(user);
    await waitFor(() => expect(useLibrary.getState().projects).toHaveLength(1));
    const project = useLibrary.getState().projects[0];
    expect(project).toMatchObject({ name: 'Jesienny', kind: 'sweater', sizes: ['S', 'M'] });
    expect(project?.sizeIndex).toBe(1);
    expect(project?.patterns.map((p) => [p.name, p.charts.map((c) => c.name)])).toEqual([
      ['Ściągacz dołu', []],
      ['Rękaw', ['A.2']],
      ['Tył', ['A.1', 'A.2']],
      ['Przód', ['A.1', 'A.2']],
      ['Ściągacz rękawa', []],
      ['Dekolt / golf', []],
    ]);
    // Knitting starts with the first part.
    await waitFor(() =>
      expect(window.location.pathname).toBe(`/projekt/${project?.id}/wzor/bottom-rib`),
    );
  });

  it('opens a part in the creator, its charts laid as tiles and all charts in the library', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toPreview(user);
    await user.click(tab(/Korpus/));
    await user.click(screen.getByRole('button', { name: 'Popraw' }));
    expect(screen.getByText(/schematy z PDF leżą na siatce jako kafelki/)).toBeInTheDocument();
    // The shortcut at the top leads to the button under "Ułożenie i wymiary".
    expect(screen.getByRole('button', { name: 'Przejdź do kreatora ↓' })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: /^Otwórz w kreatorze z tym ułożeniem — siatka \d+ × \d+$/,
      }),
    );
    await waitFor(() => expect(useLibrary.getState().projects).toHaveLength(1));
    const project = useLibrary.getState().projects[0];
    expect(project?.motifs?.map((m) => m.name)).toEqual(['A.1', 'A.2']);
    const body = project?.patterns.find((p) => p.id === 'body');
    expect(body?.design?.placements.map((p) => [p.col, p.repeatX])).toEqual([
      [1, 1],
      [3, 1],
    ]);
    await waitFor(() =>
      expect(window.location.pathname).toBe(`/projekt/${project?.id}/wzor/body/kreator`),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Z pliku wzoru' }),
    ).toBeInTheDocument();
  });

  it('puts the round together in Popraw: charts from the right, its stitches, centred, length from the PDF', async () => {
    const user = userEvent.setup();
    const text =
      'Sweter Jesienny\nROZMIARY: S - M\nKORPUS\nPrzerabiać do wys. 34-36 cm.\nRękawy: nabierz oczka.';
    useImport.setState({ description: { text, parsed: parseDescription(text) } });
    render(<App />);
    await toPreview(user);
    await user.click(tab(/Korpus/));
    await user.click(screen.getByRole('button', { name: 'Popraw' }));
    const order = () =>
      within(screen.getByRole('list', { name: 'Kolejność schematów od oczka 1' }))
        .getAllByRole('listitem')
        .map((li) => li.querySelector('b')?.textContent);
    expect(order()).toEqual(['A.1', 'A.2']);
    expect(screen.getByText('✓ Schematy wypełniają całe okrążenie.')).toBeInTheDocument();
    // The length comes from the body's section of the text, at size M.
    expect(screen.getByLabelText('Długość części (cm)')).toHaveValue('36');
    expect(screen.getByText('Z PDF: „Przerabiać do wys. 34-36 cm”')).toBeInTheDocument();

    const round = screen.getByLabelText('Oczek w okrążeniu');
    await user.clear(round);
    await user.type(round, '20');
    expect(
      screen.getByText(
        'Schematy: 4 oczek, na środku przodu i na środku tyłu; reszta to prawe oczka.',
      ),
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('group', { name: 'Dodaj schemat' })).getByRole('button', {
        name: /A\.1/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'A.2 — o jedno miejsce dalej (w lewo)' }));
    expect(order()).toEqual(['A.1', 'A.1', 'A.2']);
    expect(screen.getByLabelText('Oczek w okrążeniu')).toHaveValue('20');

    await user.click(screen.getByRole('button', { name: 'Wróć do podglądu' }));
    await agreeAll(user);
    await waitFor(() => expect(useLibrary.getState().projects).toHaveLength(1));
    const body = useLibrary.getState().projects[0]?.patterns.find((p) => p.id === 'body');
    expect(body).toMatchObject({ targetCm: 36, expectedStitches: 20 });
    // Front: 2 knit, A.1, A.1, A.2, 2 knit (10); then the same on the back.
    expect(
      body?.layout.map((x) =>
        x.kind === 'marker' ? `|${x.sectionName ?? ''}` : `${x.chartId}:${String(x.stitches)}`,
      ),
    ).toEqual([
      '|Przód',
      'prawe:2',
      'a-1:2',
      'a-1:2',
      'a-2:2',
      'prawe:2',
      '|Tył',
      'prawe:2',
      'a-1:2',
      'a-1:2',
      'a-2:2',
      'prawe:2',
    ]);
  });

  it('chooses in the parts step how the body is made; its back and front are tracked on their own', async () => {
    const user = userEvent.setup();
    // The text makes the body as a back and a front: the parts start "in pieces".
    useImport.setState({ result: { ...result, text: 'TYŁ\nNabrać 80 oczek.\nPRZÓD\nJak tył.' } });
    useImport.getState().setProjectKind('sweater');
    render(<App />);
    expect(await screen.findByRole('radio', { name: 'Z osobnych części' })).toBeChecked();
    expect(screen.getByText('Z PDF: osobne części (TYŁ, PRZÓD).')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Tył' })).toBeChecked();
    expect(
      screen.getByTestId('garment-diagram').querySelector('[data-behind="body"]'),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Dalej: 6 części' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Przód' }));
    expect(screen.getByRole('button', { name: 'Dalej: 5 części' })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'Na okrągło, w jednym kawałku' }));
    expect(screen.queryByRole('checkbox', { name: 'Tył' })).toBeNull();
    expect(screen.getByTestId('garment-diagram').querySelector('[data-behind="body"]')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Z osobnych części' }));
    await user.click(screen.getByRole('checkbox', { name: 'Tył' }));
    await toPreview(user);
    expect(tab(/Przód/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tył$/ })).toBeNull();
  });

  it('checks the parts one by one from the lowest number; only the last one starts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toPreview(user);
    expect(tab(/Ściągacz dołu/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Sprawdzone części: 0 z 5. Następna: Rękaw.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zgadza się, zaczynam' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Zgadza się, następna' }));
    expect(tab(/Rękaw$/)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(/Ściągacz dołu/)).toHaveAccessibleName(/Ściągacz dołu ?\(sprawdzona\)/);
    // Jumping to the last part: after it, the check goes back to the first one left.
    await user.click(tab(/Dekolt/));
    await user.click(screen.getByRole('button', { name: 'Zgadza się, następna' }));
    expect(tab(/Rękaw$/)).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Zgadza się, następna' }));
    expect(tab(/Korpus/)).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Zgadza się, następna' }));
    expect(tab(/Ściągacz rękawa/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Sprawdzone części: 4 z 5.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zgadza się, zaczynam' }));
    await waitFor(() => expect(useLibrary.getState().projects).toHaveLength(1));
    const project = useLibrary.getState().projects[0];
    expect(project?.patterns.every((p) => p.ready)).toBe(true);
    await waitFor(() =>
      expect(window.location.pathname).toBe(`/projekt/${project?.id}/wzor/bottom-rib`),
    );
  });

  it('starts over with the usual parts when the kind is changed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(await screen.findByLabelText('Zmień rodzaj'), 'socks');
    expect(screen.getByText('Rodzaj zmieniony ręcznie.')).toBeInTheDocument();
    expect(screen.getByText(/Robione w parze/)).toBeInTheDocument();
    expect(
      screen.getByText('Typowa kolejność (od mankietu) — opis jej nie podaje.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^1\.\s?Ściągacz$/ })).toBeChecked();
    await user.selectOptions(screen.getByLabelText('Zmień rodzaj'), 'custom');
    expect(screen.queryByTestId('garment-diagram')).not.toBeInTheDocument();
    await toPreview(user);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Wzór — rozmiar M');
  });
});

describe('new project from a PDF: size and legend first', () => {
  beforeEach(() => {
    useImport.setState({ step: 'size', sizes: ['S', 'M'], sizeIndex: 0 });
  });

  it('asks for the size, showing where the sizes were read from', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Który rozmiar dziergasz?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ROZMIARY: S - M/)).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Kroki' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1Nazwa', '2Rozmiar', '3Legenda', '4Części', '5Podgląd']);
    expect(within(steps).getByText('Rozmiar').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('radio', { name: 'S' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'M' }));
    expect(useImport.getState().sizeIndex).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Popraw listę rozmiarów' }));
    const field = screen.getByLabelText('Rozmiary');
    await user.clear(field);
    await user.type(field, 'S - M - L');
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'S',
      'M',
      'L',
    ]);
    await user.click(screen.getByRole('button', { name: 'Dalej: rozmiar M' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Symbole w schematach' }),
    ).toBeInTheDocument();
  });

  it('asks for the project name first, then goes on to the size and back', async () => {
    const user = userEvent.setup();
    useImport.setState({ step: 'name', projectName: '' });
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Jak nazwiesz projekt?' }),
    ).toBeInTheDocument();
    const name = screen.getByLabelText('Nazwa projektu');
    await user.clear(name);
    await user.type(name, 'Sweter dla Ani');
    await user.click(screen.getByRole('button', { name: 'Dalej' }));
    expect(useImport.getState().projectName).toBe('Sweter dla Ani');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Który rozmiar dziergasz?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wstecz' }));
    expect(screen.getByLabelText('Nazwa projektu')).toHaveValue('Sweter dla Ani');
  });

  it('confirms the legend, then shows the parts; earlier steps can be reopened', async () => {
    const user = userEvent.setup();
    useImport.setState({ step: 'legend' });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Zatwierdź legendę' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Sweter' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wstecz' }));
    expect(screen.getByRole('button', { name: 'Zatwierdź legendę' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Rozmiar/ }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Który rozmiar dziergasz?' }),
    ).toBeInTheDocument();
  });

  it('skips the legend when the file has neither a legend nor charts, and offers one size', async () => {
    const user = userEvent.setup();
    useImport.setState({
      result: { ...result, charts: [] },
      charts: [],
      sizes: [],
      description: { text: 'Czapka', parsed: parseDescription('Czapka') },
    });
    render(<App />);
    expect(await screen.findByText(/nie znaleźliśmy rozmiarów/)).toBeInTheDocument();
    expect(screen.getByText('Jeden rozmiar')).toBeInTheDocument();
    expect(screen.getByLabelText('Rozmiary')).toBeInTheDocument();
    expect(screen.queryByText('Legenda')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dalej' }));
    expect(screen.getByRole('group', { name: 'Co chcesz śledzić?' })).toBeInTheDocument();
  });
});
