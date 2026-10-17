import { serializePattern } from '@kt/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { initI18n } from '../i18n';
import { navigate } from '../lib/router';
import { createMemoryStorage } from '../lib/storage';
import { samplePattern } from '../sample/samplePattern';
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
  navigate('/', { replace: true });
});

describe('screens', () => {
  it('invites to start on an empty device and warns when storage is not persistent', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Twoje projekty' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Zacznij od wzoru' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wczytaj plik wzoru/ })).toHaveAttribute(
      'href',
      '/nowy',
    );
    // Memory storage in tests → the permanent warning is shown.
    expect(screen.getByRole('alert')).toHaveTextContent('Postęp nie będzie zapisany.');
  });

  it('imports a pattern file, reports invalid files and creates a project with a variant', async () => {
    const user = userEvent.setup();
    navigate('/nowy', { replace: true });
    const { container } = render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Nowy projekt' });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input missing');
    expect(input.closest('label')).toHaveTextContent('Wybierz plik wzoru');

    await user.upload(input, new File(['{"nope":1}'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText('Tego pliku nie da się wczytać')).toBeInTheDocument();

    const text = serializePattern(samplePattern);
    await user.upload(input, new File([text], 'wzor.json', { type: 'application/json' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: samplePattern.title }),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText('Przerabiaj schemat Ryż samymi oczkami prawymi'));
    await user.clear(screen.getByLabelText('Nazwa projektu'));
    await user.type(screen.getByLabelText('Nazwa projektu'), 'Sweter testowy');
    await user.click(screen.getByRole('button', { name: 'Utwórz projekt' }));

    await waitFor(() => expect(location.pathname).toMatch(/^\/projekt\//));
    const project = useLibrary.getState().projects[0];
    expect(project?.name).toBe('Sweter testowy');
    expect(project?.modifications).toHaveLength(1);
  });
});
