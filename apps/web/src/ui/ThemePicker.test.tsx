import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { initI18n } from '../i18n';
import { THEMES, type ThemePref } from '../lib/preferences';
import { ThemePicker } from './ThemePicker';

initI18n('pl');

function Harness() {
  const [value, setValue] = useState<ThemePref>('system');
  return (
    <>
      <ThemePicker value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('ThemePicker', () => {
  it('offers "system" plus every theme as one radio group', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Motyw' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(THEMES.length + 1);
    expect(screen.getByRole('radio', { name: /Jak w systemie/ })).toBeChecked();
  });

  it('selects a theme by its name, marks the premium ones and previews in that theme', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('radio', { name: /Kłębek nocą/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('yarn-night');
    expect(screen.getByRole('radio', { name: /Kłębek nocą/ })).toBeChecked();
    expect(screen.getByTestId('theme-yarn')).toHaveTextContent('Premium');
    expect(screen.getByTestId('theme-moss')).not.toHaveTextContent('Premium');
    expect(
      screen.getByTestId('theme-lamp').querySelector('[data-theme-preview="lamp"]'),
    ).not.toBeNull();
    const system = screen.getByTestId('theme-system');
    expect(system.querySelector('[data-theme-preview="light"]')).not.toBeNull();
    expect(system.querySelector('[data-theme-preview="dark"]')).not.toBeNull();
  });
});
