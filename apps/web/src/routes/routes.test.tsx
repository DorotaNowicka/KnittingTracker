import { serializeProject } from '@kt/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { sampleProject } from '../sample/sampleProject';
import { setStorageForTests, useLibrary } from '../state/library';

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

  it('opens a project file, reports invalid files and creates the project', async () => {
    const user = userEvent.setup();
    navigate('/nowy', { replace: true });
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Nowy projekt' });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input missing');
    expect(input.closest('label')).toHaveTextContent('Wczytaj plik projektu');

    await user.upload(input, new File(['{"nope":1}'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText('Tego pliku nie da się wczytać')).toBeInTheDocument();

    const text = serializeProject(sample());
    await user.upload(input, new File([text], 'projekt.json', { type: 'application/json' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Przykład' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Zacznij od wzoru'), 'rib');
    await user.clear(screen.getByLabelText('Nazwa projektu'));
    await user.type(screen.getByLabelText('Nazwa projektu'), 'Sweter testowy');
    await user.click(screen.getByRole('button', { name: 'Utwórz projekt' }));

    await waitFor(() => expect(location.pathname).toMatch(/^\/projekt\/[^/]+\/wzor\/rib$/));
    const project = useLibrary.getState().projects[0];
    expect(project?.name).toBe('Sweter testowy');
    // A file never reuses an id already on the device.
    expect(project?.id).not.toBe('s1');
    expect(project?.patterns).toHaveLength(2);
  });
});
