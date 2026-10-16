import { useSyncExternalStore } from 'react';

/**
 * Minimal History-API router: the app has a handful of screens, so a dependency is not worth it
 * (ADR-0001 note). nginx serves index.html for unknown paths, so deep links work.
 */
export type Route =
  | { readonly name: 'projects' }
  | { readonly name: 'new' }
  | { readonly name: 'project'; readonly id: string }
  | { readonly name: 'settings' }
  | { readonly name: 'patterns' }
  | { readonly name: 'import' }
  | { readonly name: 'pattern'; readonly id: string }
  | { readonly name: 'patternProject'; readonly id: string }
  | { readonly name: 'chart'; readonly id: string; readonly chartId: string }
  | { readonly name: 'stage'; readonly id: string; readonly stageId: string }
  | { readonly name: 'notFound' };

const enc = encodeURIComponent;

export const paths = {
  projects: () => '/',
  new: () => '/nowy',
  project: (id: string) => `/projekt/${enc(id)}`,
  settings: () => '/ustawienia',
  patterns: () => '/wzory',
  import: () => '/import',
  pattern: (id: string) => `/wzor/${enc(id)}`,
  patternProject: (id: string) => `/wzor/${enc(id)}/nowy-projekt`,
  chart: (id: string, chartId: string) => `/wzor/${enc(id)}/schemat/${enc(chartId)}`,
  stage: (id: string, stageId: string) => `/wzor/${enc(id)}/etap/${enc(stageId)}`,
};

const decode = (parts: readonly (string | undefined)[]): string[] | null => {
  try {
    return parts.map((p) => decodeURIComponent(p ?? ''));
  } catch {
    return null;
  }
};

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'projects' };
  if (pathname === '/nowy') return { name: 'new' };
  if (pathname === '/ustawienia') return { name: 'settings' };
  if (pathname === '/wzory') return { name: 'patterns' };
  if (pathname === '/import') return { name: 'import' };
  let m = /^\/projekt\/([^/]+)$/.exec(pathname);
  if (m) {
    const [id] = decode([m[1]]) ?? [];
    return id ? { name: 'project', id } : { name: 'notFound' };
  }
  m = /^\/wzor\/([^/]+)(?:\/(nowy-projekt|schemat|etap)(?:\/([^/]+))?)?$/.exec(pathname);
  if (m) {
    const [id, sub] = decode([m[1], m[3]]) ?? [];
    if (!id) return { name: 'notFound' };
    if (m[2] === undefined) return { name: 'pattern', id };
    if (m[2] === 'nowy-projekt' && m[3] === undefined) return { name: 'patternProject', id };
    if (m[2] === 'schemat' && sub) return { name: 'chart', id, chartId: sub };
    if (m[2] === 'etap' && sub) return { name: 'stage', id, stageId: sub };
  }
  return { name: 'notFound' };
}

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener('popstate', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('popstate', cb);
  };
};

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  for (const l of listeners) l();
  window.scrollTo(0, 0);
}

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => location.pathname,
    () => '/',
  );
}

export function useRoute(): Route {
  return parseRoute(usePathname());
}
