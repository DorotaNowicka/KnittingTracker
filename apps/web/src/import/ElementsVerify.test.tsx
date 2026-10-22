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
    projectName: 'Mój sweter',
  });
  navigate('/import', { replace: true });
});

describe('new project from a PDF: garment parts', () => {
  it('shows the recognised kind and the garment split into parts, the body first', async () => {
    render(<App />);
    expect(await screen.findByLabelText('Rodzaj projektu')).toHaveValue('sweater');
    expect(screen.getByText(/Rozpoznaliśmy po słowach: Sweter, Rękawy/)).toBeInTheDocument();
    expect(screen.getByTestId('garment-diagram')).toBeInTheDocument();
    const body = screen.getByRole('button', { name: /Korpus/ });
    expect(body).toHaveAttribute('aria-pressed', 'true');
    expect(body).toHaveTextContent(/Na okrągło.* · 2 schematy/);
    expect(screen.getByRole('button', { name: /Rękaw ×2/ })).toHaveTextContent('licznik rzędów');
    expect(screen.getByRole('button', { name: /Karczek/ })).toHaveTextContent('pominięta');
    const panel = screen.getByTestId('part-panel');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Korpus');
    expect(within(panel).getByRole('heading', { name: 'Opis wzoru' })).toBeInTheDocument();
  });

  it('highlights a part in both the drawing and the list when pointing at either', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sleeve = await screen.findByRole('button', { name: /Rękaw ×2/ });
    const region = () =>
      screen.getByTestId('garment-diagram').querySelector('[data-part="sleeve"]');
    await user.hover(sleeve);
    expect(region()).toHaveClass('is-hover');
    await user.unhover(sleeve);
    expect(region()).not.toHaveClass('is-hover');
    const neck = screen.getByTestId('garment-diagram').querySelector('[data-part="neck"]');
    if (!neck) throw new Error('no neck region');
    await user.hover(neck);
    expect(screen.getByRole('button', { name: /Dekolt/ })).toHaveClass('is-hover');
    await user.click(neck);
    expect(screen.getByRole('button', { name: /Dekolt/ })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByTestId('part-panel')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent('Dekolt');
  });

  it('gives a chart to the sleeve, splits the body and creates the project', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Rękaw ×2/ }));
    const panel = screen.getByTestId('part-panel');
    await user.click(within(panel).getByRole('checkbox', { name: /A\.2/ }));
    expect(screen.getByRole('button', { name: /Rękaw ×2/ })).toHaveTextContent('1 schemat');
    expect(screen.getByRole('button', { name: /Korpus/ })).toHaveTextContent('1 schemat');

    await user.click(screen.getByRole('button', { name: /Korpus/ }));
    await user.click(
      within(screen.getByTestId('part-panel')).getByRole('radio', { name: /osobnych/ }),
    );
    expect(screen.getByText(/Każda z części \(Tył, Przód\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Dekolt/ }));
    await user.click(
      within(screen.getByTestId('part-panel')).getByRole('checkbox', { name: /w moim projekcie/ }),
    );
    expect(screen.getByRole('button', { name: /Dekolt/ })).toHaveTextContent('pominięta');
    expect(screen.getByText(/Powstanie 5 wzorów/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Utwórz projekt' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mój sweter' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(useLibrary.getState().projects).toHaveLength(1));
    const project = useLibrary.getState().projects[0];
    expect(project?.kind).toBe('sweater');
    expect(project?.sizes).toEqual(['S', 'M']);
    expect(project?.patterns.map((p) => [p.name, p.charts.map((c) => c.name)])).toEqual([
      ['Ściągacz dołu', []],
      ['Tył', ['A.1']],
      ['Przód', ['A.1']],
      ['Rękaw', ['A.2']],
      ['Ściągacz rękawa', []],
    ]);
  });

  it('starts over with the usual parts when the kind is changed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(await screen.findByLabelText('Rodzaj projektu'), 'socks');
    expect(screen.getByText('Rodzaj zmieniony ręcznie.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cholewka/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Robione w parze/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Rodzaj projektu'), 'custom');
    expect(screen.queryByTestId('garment-diagram')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('part-panel')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent('Wzór');
  });
});
