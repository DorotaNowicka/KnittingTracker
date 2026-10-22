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

  it('new project: a name and two tiles; "Stwórz projekt" creates an empty project', async () => {
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

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sweter testowy' }),
    ).toBeInTheDocument();
    expect(location.pathname).toMatch(/^\/projekt\/[^/]+$/);
    expect(screen.getByText('Projekt nie ma jeszcze wzorów. Dodaj pierwszy.')).toBeInTheDocument();
    const project = useLibrary.getState().projects[0];
    expect(project).toMatchObject({ name: 'Sweter testowy', patterns: [] });
  });

  it('new project without a name gets a default one', async () => {
    const user = userEvent.setup();
    navigate('/nowy', { replace: true });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Stwórz projekt/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mój projekt' }),
    ).toBeInTheDocument();
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
});
