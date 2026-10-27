/**
 * Per-device UI preferences that must be known before the first paint (theme, language). They are
 * mirrored in localStorage, read by /theme-init.js in <head>. Every access is wrapped in try/catch:
 * storage can be blocked, and the app must still work.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type LanguagePref = 'pl' | 'en';

const THEME_KEY = 'kt.theme';
const LANG_KEY = 'kt.lang';
const WAKE_KEY = 'kt.wakeLock';
const GUIDES_KEY = 'kt.guides';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: keep the in-memory value only */
  }
}

export function getThemePref(): ThemePref {
  const v = read(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', dark ? '#1a1d21' : '#edefea'));
}

export function setThemePref(pref: ThemePref): void {
  write(THEME_KEY, pref);
  applyTheme(pref);
  window.dispatchEvent(new Event('kt:themechange'));
}

export function getLanguagePref(): LanguagePref {
  const v = read(LANG_KEY);
  return v === 'en' ? 'en' : 'pl';
}

export function setLanguagePref(lang: LanguagePref): void {
  write(LANG_KEY, lang);
  document.documentElement.lang = lang;
}

export function getWakeLockPref(): boolean {
  return read(WAKE_KEY) !== 'off';
}

export function setWakeLockPref(on: boolean): void {
  write(WAKE_KEY, on ? 'on' : 'off');
}

/** Guide lines at the quarters of the grid: on unless the knitter turned them off. */
export function getGuidesPref(): boolean {
  return read(GUIDES_KEY) !== 'off';
}

export function setGuidesPref(on: boolean): void {
  write(GUIDES_KEY, on ? 'on' : 'off');
}

/** Panel sections the knitter folded away (legend, row instructions): open unless closed. */
export function getSectionOpenPref(section: string): boolean {
  return read(`kt.section.${section}`) !== 'closed';
}

export function setSectionOpenPref(section: string, open: boolean): void {
  write(`kt.section.${section}`, open ? 'open' : 'closed');
}
