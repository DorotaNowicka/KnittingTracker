import {
  applySymbolRows,
  blankChart,
  blankPattern,
  blankProject,
  chartToSymbolRows,
  fileMotifs,
  insertPattern,
} from '@kt/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate, paths } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { useDraft } from '../state/draft';
import { setStorageForTests, useLibrary } from '../state/library';
import { useGuides } from '../state/guides';
import { useMotifs } from '../state/motifs';
import { useTileClip } from '../state/tileClip';

/**
 * jsdom has no canvas: the grid is stood in by a button per stitch column (row 1), which starts
 * and ends a stroke on that cell, as a click on the real canvas does.
 */
const canvas = vi.hoisted(() => ({
  width: 0,
  /** The last grid handed to the canvas. */
  source: null as null | {
    sections: readonly { label: string; firstCol: number; lastCol: number }[];
    guides?: readonly { atCol: number; kind: string }[];
    shaded?: readonly { firstCol: number; lastCol: number }[];
  },
}));
vi.mock('../editor/EditorCanvas', () => ({
  EditorCanvas: (props: {
    source: NonNullable<typeof canvas.source>;
    testId?: string;
    onStrokeStart?(cell: { row: number; col: number }, mods?: { shift: boolean }): void;
    onLineDoubleClick?(atCol: number): void;
    onStrokeEnd?(): void;
    onHover?(cell: { row: number; col: number } | null): void;
  }) => {
    canvas.source = props.source;
    return (
      <div data-testid={props.testId}>
        {Array.from({ length: canvas.width }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              props.onStrokeStart?.({ row: 1, col: i + 1 }, { shift: e.shiftKey });
              props.onStrokeEnd?.();
            }}
            // The line on the column's left edge.
            onDoubleClick={() => props.onLineDoubleClick?.(i + 1)}
            onMouseEnter={() => props.onHover?.({ row: 1, col: i + 1 })}
            onMouseLeave={() => props.onHover?.(null)}
          >
            {`kolumna ${canvas.width - i}`}
          </button>
        ))}
      </div>
    );
  },
}));

const column = (n: number) =>
  within(screen.getByTestId('designer-canvas')).getByRole('button', { name: `kolumna ${n}` });
/** What the line under the grid says. */
const where = () => document.querySelector('.editor__where')?.textContent;

/** Click the grid in the column of stitch `n` from the right edge. */
const clickStitch = (user: ReturnType<typeof userEvent.setup>, n: number) =>
  user.click(
    within(screen.getByTestId('designer-canvas')).getByRole('button', { name: `kolumna ${n}` }),
  );

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
  it("sets a tile's width before laying it where the grid is clicked, on the bottom row", async () => {
    const user = userEvent.setup();
    canvas.width = 240;
    navigate(paths.designer('p1', 'pattern-1'), { replace: true });
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kreator wzoru: Korpus' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Szerokość (oczka)'), '240');
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), '20');
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));

    // Holding the rib: its width is set first — typing the repeats or the stitches.
    await user.click(await screen.findByRole('button', { name: /Ściągacz 1\/1/ }));
    expect(within(bar()).getByText('Kładziesz: Ściągacz 1/1')).toBeInTheDocument();
    expect(within(bar()).queryByRole('button', { name: /pierwszym wolnym/ })).toBeNull();
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('1');
    expect(within(width()).getByText('2 oczka')).toBeInTheDocument();
    const times = within(width()).getByLabelText('Ile razy');
    await user.clear(times);
    await user.type(times, '113{Enter}');
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('226');
    const stitches = within(width()).getByLabelText('Szerokość w oczkach');
    await user.clear(stitches);
    await user.type(stitches, '101{Enter}');
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('50');
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('100');
    await user.click(within(width()).getByRole('button', { name: 'O jedno powtórzenie więcej' }));
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('102');

    // Clicking stitch 1's column lays it there, standing on the bottom row; it is selected.
    await clickStitch(user, 1);
    expect(within(bar()).getByText('Ściągacz 1/1')).toBeInTheDocument();
    expect(within(bar()).getByText('powtarza się w górę co 1 rząd')).toBeInTheDocument();
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('51');

    // A cable, 2 repeats wide, can't lie on the rib; next to it, it can.
    await user.click(screen.getByRole('button', { name: /Warkocz 2\/2 w lewo/ }));
    await user.click(within(width()).getByRole('button', { name: 'O jedno powtórzenie więcej' }));
    // Pointing at the grid shows where it would land, or why it can't, before any click.
    await user.hover(column(100));
    expect(where()).toBe('Tu się nie zmieści — kafelek wszedłby na „Ściągacz 1/1”.');
    await user.hover(column(103));
    expect(where()).toBe('Kliknij, żeby położyć kafelek od oczka 103.');
    expect(pattern()?.design?.placements).toHaveLength(1);
    await clickStitch(user, 100);
    expect(within(bar()).getByRole('status')).toHaveTextContent(
      'Tu się nie zmieści — kafelek wszedłby na „Ściągacz 1/1”.',
    );
    await clickStitch(user, 103);
    expect(within(bar()).getByText('powtarza się w górę co 4 rzędy')).toBeInTheDocument();
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('12');
    await user.click(within(width()).getByRole('button', { name: 'Do końca' }));
    expect(within(width()).getByLabelText('Ile razy')).toHaveValue('23');
    expect(within(width()).getByLabelText('Szerokość w oczkach')).toHaveValue('138');

    // The rib can't grow into the cable; the field shows its real width again.
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
    // The cable crosses every 4th row (rows 3, 7, 11…), next to the rib in every row.
    expect(grid.map((r) => r.filter((id) => id === 'cable:2-2-lc').length)).toEqual([
      0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 23, 0,
    ]);

    await user.click(within(bar()).getByRole('button', { name: 'Usuń kafelek' }));
    await waitFor(() => expect(pattern()?.design?.placements).toHaveLength(1));
    // "Gotowe" marks the part set up and goes back to the garment's parts.
    expect(screen.queryByRole('link', { name: 'Dziergaj' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Gotowe' }));
    await waitFor(() => expect(window.location.pathname).toBe(paths.parts('p1')));
    expect(useLibrary.getState().projects.find((p) => p.id === 'p1')?.patterns[0]?.ready).toBe(
      true,
    );
  });

  it('offers the charts of the pattern file in their own part of the library', async () => {
    const user = userEvent.setup();
    canvas.width = 12;
    const a1 = applySymbolRows(blankChart({ id: 'a-1', name: 'A.1' }, 1, 1), [
      ['std:p', 'std:k', 'std:k'],
    ]);
    await useLibrary.getState().addProject({
      ...blankProject({
        id: 'p2',
        name: 'Sweter z PDF',
        kind: 'sweater',
        sizes: ['M'],
        patternName: 'Rękaw',
        now: '2026-10-25T10:00:00.000Z',
      }),
      motifs: fileMotifs([a1]),
    });
    navigate(paths.designer('p2', 'pattern-1'), { replace: true });
    render(<App />);
    await user.type(await screen.findByLabelText('Szerokość (oczka)'), '12');
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), '4');
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));

    const file = screen.getByRole('region', { name: 'Z pliku wzoru' });
    expect(
      within(file)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('A.1')]);
    // The ready-made pieces stay in the library below.
    expect(
      within(screen.getByRole('region', { name: 'Biblioteka wzorów' })).queryByText('A.1'),
    ).toBeNull();
    await user.click(within(file).getByRole('button', { name: /A\.1/ }));
    const times = within(width()).getByLabelText('Ile razy');
    await user.clear(times);
    await user.type(times, '4{Enter}');
    await clickStitch(user, 1);
    await waitFor(() => expect(pattern()?.design?.placements).toHaveLength(1));
    const grid = chartToSymbolRows(pattern()?.charts[0] ?? a1);
    expect(grid[0]).toEqual(Array.from({ length: 4 }, () => ['std:p', 'std:k', 'std:k']).flat());
  });

  it('shows a body in the round as front | back, with guide lines that can be turned off', async () => {
    const user = userEvent.setup();
    canvas.width = 0;
    localStorage.removeItem('kt.guides');
    useGuides.setState({ on: true });
    await useLibrary.getState().addProject(
      insertPattern(
        blankProject({
          id: 'p3',
          name: 'Sweter',
          kind: 'sweater',
          sizes: ['M'],
          now: '2026-10-25T10:00:00.000Z',
        }),
        blankPattern('body', 'Korpus'),
      ).project,
    );
    navigate(paths.designer('p3', 'body'), { replace: true });
    render(<App />);
    await user.type(await screen.findByLabelText('Szerokość (oczka)'), '9');
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), '4');
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));

    // The front (stitches 1-5) on the right, the back on the left, apart.
    const halves = await screen.findByRole('checkbox', { name: 'Podziel na przód i tył' });
    expect(halves).toBeChecked();
    expect(canvas.source?.sections).toEqual([
      { label: 'Tył', firstCol: 1, lastCol: 4 },
      { label: 'Przód', firstCol: 5, lastCol: 9 },
    ]);
    // Quarter lines; the half is the gap between front and back.
    expect(canvas.source?.guides).toEqual([
      { atCol: 8, kind: 'quarter' },
      { atCol: 3, kind: 'quarter' },
    ]);
    await waitFor(() =>
      expect(
        pattern()?.layout.flatMap((x) => (x.kind === 'marker' ? [x.sectionName] : [])),
      ).toEqual(['Przód', 'Tył']),
    );

    await user.click(screen.getByRole('button', { name: 'Linie co ¼' }));
    expect(screen.getByRole('button', { name: 'Linie co ¼' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(canvas.source?.guides).toEqual([]);
    expect(localStorage.getItem('kt.guides')).toBe('off');

    await user.click(halves);
    expect(canvas.source?.sections).toEqual([]);
    await waitFor(() => expect(pattern()?.charts.map((c) => c.id)).toEqual(['design']));
  });

  let fresh = 0;
  /** A new project of its own, its pattern opened in the creator with a w × h grid. */
  const newGrid = async (user: ReturnType<typeof userEvent.setup>, w: number, h: number) => {
    canvas.width = w;
    fresh += 1;
    const id = `fresh-${fresh}`;
    await useLibrary.getState().addProject(
      blankProject({
        id,
        name: 'Sweter',
        sizes: ['M'],
        patternName: 'Korpus',
        now: '2026-10-25T10:00:00.000Z',
      }),
    );
    navigate(paths.designer(id, 'pattern-1'), { replace: true });
    render(<App />);
    await user.type(await screen.findByLabelText('Szerokość (oczka)'), String(w));
    await user.type(screen.getByLabelText('Wysokość (rzędy)'), String(h));
    await user.click(screen.getByRole('button', { name: 'Utwórz siatkę' }));
  };
  const lay = async (user: ReturnType<typeof userEvent.setup>, piece: RegExp, stitch: number) => {
    const library = await screen.findByRole('region', { name: 'Biblioteka wzorów' });
    await user.click(within(library).getByRole('button', { name: piece }));
    await clickStitch(user, stitch);
  };
  const cols = () => pattern()?.design?.placements.map((p) => p.col);

  it('selects several tiles with Shift, copies them together, pastes them in hand, Delete removes', async () => {
    const user = userEvent.setup();
    useTileClip.setState({ clip: null });
    await newGrid(user, 12, 2);
    await lay(user, /Lewe oczka/, 1);
    await lay(user, /Ściągacz 1\/1/, 3);
    // The rib just laid is selected; Shift + click adds the purl tile.
    await user.keyboard('{Shift>}');
    await clickStitch(user, 1);
    await user.keyboard('{/Shift}');
    expect(within(bar()).getByText('Zaznaczone 2 kafelki')).toBeInTheDocument();

    await user.keyboard('{Control>}c{/Control}');
    expect(within(bar()).getByRole('status')).toHaveTextContent('Skopiowano 2 kafelki');
    await user.keyboard('{Control>}v{/Control}');
    expect(within(bar()).getByText('Wklejasz 2 kafelki')).toBeInTheDocument();
    // In hand they keep their spacing: from stitch 2 the rib would land on the rib.
    await user.hover(column(2));
    expect(where()).toBe('Tu się nie zmieści — kafelek wszedłby na „Ściągacz 1/1”.');
    await clickStitch(user, 7);
    await waitFor(() => expect(cols()).toEqual([1, 3, 7, 9]));
    expect(within(bar()).getByText('Zaznaczone 2 kafelki')).toBeInTheDocument();

    await user.keyboard('{Delete}');
    await waitFor(() => expect(cols()).toEqual([1, 3]));
    // Shift + click in the list selects there too; the button pastes like Ctrl+V.
    const placed = screen.getByRole('region', { name: 'Na siatce' });
    const items = () => within(placed).getAllByRole('button', { pressed: false });
    await user.click(items()[0] as HTMLElement);
    await user.keyboard('{Shift>}');
    await user.click(items()[0] as HTMLElement);
    await user.keyboard('{/Shift}');
    expect(within(bar()).getByText('Zaznaczone 2 kafelki')).toBeInTheDocument();
    await user.click(within(bar()).getByRole('button', { name: 'Wklej' }));
    expect(within(bar()).getByText('Wklejasz 2 kafelki')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(within(bar()).queryByText(/Wklejasz/)).toBeNull();
  });

  it('mirrors the right side onto the left, live: from the panel or a double click on a line', async () => {
    const user = userEvent.setup();
    await newGrid(user, 8, 1);
    await lay(user, /Lewe oczka/, 1);
    const row = () => {
      const c = pattern()?.charts[0];
      return c
        ? (chartToSymbolRows(c)[0] ?? []).map((id) => (id === 'std:p' ? 'p' : 'k')).join('')
        : '';
    };
    await user.click(screen.getByRole('checkbox', { name: 'Odbij w ½' }));
    await waitFor(() => expect(row()).toBe('pkkkkkkp'));
    expect(canvas.source?.shaded).toEqual([{ firstCol: 1, lastCol: 4 }]);
    // The ¼ line is the left edge of stitch 2's column: a double click mirrors there too.
    await user.dblClick(column(2));
    await waitFor(() => expect(pattern()?.design?.mirrors).toEqual([2, 1]));
    expect(row()).toBe('pkkppkkp');
    expect(screen.getByRole('checkbox', { name: 'Odbij w ¼' })).toBeChecked();
    // Nothing can be laid in a mirror image.
    await lay(user, /Lewe oczka/, 7);
    expect(within(bar()).getByRole('status')).toHaveTextContent(
      'Tu jest odbicie lustrzane — połóż kafelek po prawej stronie osi.',
    );
    await user.keyboard('{Escape}');
    await user.dblClick(column(2));
    await waitFor(() => expect(pattern()?.design?.mirrors).toEqual([2]));
  });
});
