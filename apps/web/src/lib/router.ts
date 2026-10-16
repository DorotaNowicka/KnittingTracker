import { useSyncExternalStore } from 'react';

/**
 * Minimal History-API router: the app has four screens, so a dependency is not worth it
 * (ADR-0001 note). nginx serves index.html for unknown paths, so deep links work.
 */
export type Route =
  | { readonly name: 'projects' }
  | { readonly name: 'new' }
  | { readonly name: 'project'; readonly id: string }
  | { readonly name: 'settings' }
  | { readonly name: 'notFound' };

export const paths = {
  projects: () => '/',
  new: () => '/nowy',
  project: (id: string) => `/projekt/${encodeURIComponent(id)}`,
  settings: () => '/ustawienia',
};

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'projects' };
  if (pathname === '/nowy') return { name: 'new' };
  if (pathname === '/ustawienia') return { name: 'settings' };
  const m = /^\/projekt\/([^/]+)$/.exec(pathname);
  if (m?.[1]) {
    try {
      return { name: 'project', id: decodeURIComponent(m[1]) };
    } catch {
      return { name: 'notFound' };
    }
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
