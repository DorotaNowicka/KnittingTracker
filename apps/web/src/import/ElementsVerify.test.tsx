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
  return screen.findByRole('button', { name: 'Zgadza się, zaczynam' });
};

const tab = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Części do podglądu' })).getByRole('button', { name });

describe('new project from a PDF: parts to track', () => {
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
    await user.click(screen.getByText('Schematy tej części'));
    await user.click(screen.getByRole('checkbox', { name: /A\.2/ }));
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

    await user.click(screen.getByRole('button', { name: 'Zgadza się, zaczynam' }));
    await waitFor(() => expect(useLibrary.getState().projects).toHaveLength(1));
    const project = useLibrary.getState().projects[0];
    expect(project).toMatchObject({ name: 'Jesienny', kind: 'sweater', sizes: ['S', 'M'] });
    expect(project?.sizeIndex).toBe(1);
    expect(project?.patterns.map((p) => [p.name, p.charts.map((c) => c.name)])).toEqual([
      ['Ściągacz dołu', []],
      ['Rękaw', ['A.2']],
      ['Tył', ['A.1']],
      ['Przód', ['A.1']],
      ['Ściągacz rękawa', []],
      ['Dekolt / golf', []],
    ]);
    // The tracker opens on the part that was previewed.
    await waitFor(() => expect(window.location.pathname).toBe(`/projekt/${project?.id}/wzor/back`));
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
    ).toEqual(['1Rozmiar', '2Legenda', '3Części', '4Podgląd']);
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
