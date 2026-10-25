import {
  applyDesign,
  blankDesign,
  blankPattern,
  blankProject,
  createRegistry,
  insertPattern,
  MOTIF_LIBRARY,
} from '@kt/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { onBottom, placeMotif } from '../designer/designOps';
import { initI18n } from '../i18n';
import { navigate, paths } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { setStorageForTests, useLibrary } from '../state/library';
import { useSession } from '../state/session';

const rib = MOTIF_LIBRARY.find((m) => m.chart.id === 'lib:rib-2-2')?.chart;

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
  if (!rib) throw new Error('no rib');
  const design = placeMotif(blankDesign(8, 6), rib, onBottom(1, 2)).design;
  const pattern = applyDesign({ ...blankPattern('body', 'Korpus'), design }, createRegistry());
  const project = insertPattern(
    blankProject({ id: 'p1', name: 'Sweter', sizes: ['M'], now: '2026-10-25T10:00:00.000Z' }),
    pattern,
  ).project;
  await useLibrary.getState().addProject(project);
});

const length = () => screen.getByRole('group', { name: 'Długość wzoru' });
const rows = () => useSession.getState().project?.patterns[0]?.design?.height;

describe('length of a drawn pattern while knitting', () => {
  it('adds and removes rounds, and asks before going below the marked progress', async () => {
    const user = userEvent.setup();
    navigate(paths.tracker('p1', 'body'), { replace: true });
    render(<App />);
    const field = await within(
      await screen.findByRole('group', { name: 'Długość wzoru' }),
    ).findByLabelText('Długość wzoru');
    expect(field).toHaveValue('6');

    await user.click(within(length()).getByRole('button', { name: 'O jedno okrążenie więcej' }));
    await waitFor(() => expect(rows()).toBe(7));
    // The rib repeats up into the new round.
    expect(useSession.getState().grid?.plannedRows).toBe(7);
    const input = within(length()).getByLabelText('Długość wzoru');
    await user.clear(input);
    await user.type(input, '10{Enter}');
    await waitFor(() => expect(rows()).toBe(10));

    // Three rounds and one stitch done: the 4th round has progress.
    const model = useSession.getState().model;
    if (!model) throw new Error('no model');
    useSession.getState().dispatch({ type: 'set', done: model.rowStart(4) + 1 });
    await user.click(within(length()).getByRole('button', { name: 'O jedno okrążenie mniej' }));
    await waitFor(() => expect(rows()).toBe(9));

    const shorter = within(length()).getByLabelText('Długość wzoru');
    await user.clear(shorter);
    await user.type(shorter, '2{Enter}');
    expect(
      screen.getByText(
        'Masz już zaznaczone 4 okrążenia. Po skróceniu wzoru do 2 okrążeń zaznaczenia powyżej znikną.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(rows()).toBe(9);
    expect(within(length()).getByLabelText('Długość wzoru')).toHaveValue('9');

    const again = within(length()).getByLabelText('Długość wzoru');
    await user.clear(again);
    await user.type(again, '2{Enter}');
    await user.click(screen.getByRole('button', { name: 'Skróć do 2 okrążeń' }));
    await waitFor(() => expect(rows()).toBe(2));
    // Progress above the new top is gone: two whole rounds of 8 stitches stay.
    await waitFor(() => expect(useSession.getState().progress.done).toBe(16));
  });
});
