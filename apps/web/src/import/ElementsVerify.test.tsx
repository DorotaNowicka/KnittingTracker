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
    projectName: 'Mój sweter',
  });
  navigate('/import', { replace: true });
});

const toDetails = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /^Dalej/ }));
  return screen.findByTestId('part-panel');
};

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

  it('shows only tracked parts in the details, opening the body first', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('checkbox', { name: /Dekolt/ }));
    const panel = await toDetails(user);
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('4Korpus');
    expect(within(panel).getByRole('heading', { name: 'Opis wzoru' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dekolt/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rękaw ×2/ })).toHaveTextContent('licznik rzędów');
    const neck = screen.getByTestId('garment-diagram').querySelector('[data-part="neck"]');
    expect(neck).toHaveClass('is-inert');
    if (neck) await user.click(neck);
    expect(
      within(screen.getByTestId('part-panel')).getByRole('heading', { level: 2 }),
    ).toHaveTextContent('Korpus');
    await user.click(screen.getByRole('button', { name: 'Części do śledzenia' }));
    expect(screen.getByRole('checkbox', { name: /Dekolt/ })).not.toBeChecked();
  });

  it('gives a chart to the sleeve, splits the body and creates the project in knitting order', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toDetails(user);
    await user.click(screen.getByRole('button', { name: /Rękaw ×2/ }));
    const panel = screen.getByTestId('part-panel');
    await user.click(within(panel).getByRole('checkbox', { name: /A\.2/ }));
    expect(screen.getByRole('button', { name: /Rękaw ×2/ })).toHaveTextContent('1 schemat');
    expect(screen.getByRole('button', { name: /Korpus/ })).toHaveTextContent('1 schemat');

    await user.click(screen.getByRole('button', { name: /Korpus/ }));
    await user.click(
      within(screen.getByTestId('part-panel')).getByRole('radio', { name: /osobnych/ }),
    );
    expect(screen.getByText(/Każda z części \(Tył, Przód\)/)).toBeInTheDocument();
    expect(screen.getByText(/Powstanie 6 wzorów/)).toBeInTheDocument();

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
      ['Rękaw', ['A.2']],
      ['Tył', ['A.1']],
      ['Przód', ['A.1']],
      ['Ściągacz rękawa', []],
      ['Dekolt / golf', []],
    ]);
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
    const panel = await toDetails(user);
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Wzór');
  });
});
