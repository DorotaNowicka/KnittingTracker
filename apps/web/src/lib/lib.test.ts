import { afterEach, describe, expect, it, vi } from 'vitest';
import { slug } from './files';
import {
  getLanguagePref,
  getThemePref,
  getWakeLockPref,
  isThemePref,
  setThemePref,
  THEMES,
} from './preferences';
import { parseRoute, paths } from './router';

describe('router', () => {
  it('parses every route and round-trips project ids', () => {
    expect(parseRoute('/')).toEqual({ name: 'projects' });
    expect(parseRoute('/nowy')).toEqual({ name: 'new' });
    expect(parseRoute('/ustawienia')).toEqual({ name: 'settings' });
    expect(parseRoute(paths.project('a b/ć'))).toEqual({ name: 'project', id: 'a b/ć' });
    expect(parseRoute(paths.parts('p1'))).toEqual({ name: 'parts', id: 'p1' });
    expect(parseRoute(paths.designer('p1', 'body'))).toEqual({
      name: 'designer',
      id: 'p1',
      patternId: 'body',
    });
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

  it('remembers every theme and ignores unknown values', () => {
    const meta = document.head.appendChild(document.createElement('meta'));
    meta.name = 'theme-color';
    for (const { id, chrome } of THEMES) {
      setThemePref(id);
      expect(getThemePref()).toBe(id);
      expect(document.documentElement.getAttribute('data-theme')).toBe(id);
      expect(meta.getAttribute('content')).toBe(chrome);
    }
    meta.remove();
    setThemePref('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    localStorage.setItem('kt.theme', 'sepia');
    expect(getThemePref()).toBe('system');
    expect(isThemePref('yarn-night')).toBe(true);
    expect(isThemePref('YARN')).toBe(false);
  });
});

describe('files', () => {
  it('builds safe Polish-friendly file names', () => {
    expect(slug('Łabędzie & żółw: 2026')).toBe('labedzie-zolw-2026');
    expect(slug('***')).toBe('wzor');
  });
});
