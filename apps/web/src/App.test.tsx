import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { App } from './App';
import { initI18n } from './i18n';

describe('App shell', () => {
  beforeAll(() => {
    initI18n('pl');
  });

  it('renders the Polish projects heading and empty state', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Twoje projekty' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Nie masz jeszcze żadnych projektów',
    );
  });
});
