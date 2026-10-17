import { afterEach, describe, expect, it, vi } from 'vitest';
import { slug } from './files';
import { getLanguagePref, getThemePref, getWakeLockPref, setThemePref } from './preferences';
import { parseRoute, paths } from './router';

describe('router', () => {
  it('parses every route and round-trips project ids', () => {
    expect(parseRoute('/')).toEqual({ name: 'projects' });
    expect(parseRoute('/nowy')).toEqual({ name: 'new' });
    expect(parseRoute('/ustawienia')).toEqual({ name: 'settings' });
    expect(parseRoute(paths.project('a b/ć'))).toEqual({ name: 'project', id: 'a b/ć' });
    expect(parseRoute('/projekt/%E0%A4%A')).toEqual({ name: 'notFound' });
    expect(parseRoute('/other')).toEqual({ name: 'notFound' });
  });
});

describe('preferences', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falls back to defaults when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getThemePref()).toBe('system');
    expect(getLanguagePref()).toBe('pl');
    expect(getWakeLockPref()).toBe(true);
    expect(() => setThemePref('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('files', () => {
  it('builds safe Polish-friendly file names', () => {
    expect(slug('Łabędzie & żółw: 2026')).toBe('labedzie-zolw-2026');
    expect(slug('***')).toBe('wzor');
  });
});
