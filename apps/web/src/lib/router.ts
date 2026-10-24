import { useSyncExternalStore } from 'react';

/**
 * Minimal History-API router: the app has a handful of screens, so a dependency is not worth it
 * (ADR-0001 note). nginx serves index.html for unknown paths, so deep links work.
 */
export type Route =
  | { readonly name: 'projects' }
  | { readonly name: 'new' }
  /** Second step of "Stwórz projekt": what kind of project. */
  | { readonly name: 'newKind' }
  | { readonly name: 'settings' }
  /** Import a PDF or picture: into a new project, or as a new pattern of `id`. */
  | { readonly name: 'import'; readonly id?: string }
  /** A project: its patterns, sizes and settings. */
  | { readonly name: 'project'; readonly id: string }
  /** The garment of a project split into parts; a part opens its pattern. */
  | { readonly name: 'parts'; readonly id: string }
  /** Tracking one pattern of a project. */
  | { readonly name: 'tracker'; readonly id: string; readonly patternId: string }
  /** Editing one pattern: its charts, layout and legend. */
  | { readonly name: 'pattern'; readonly id: string; readonly patternId: string }
  /** The chart editor. */
  | {
      readonly name: 'chart';
      readonly id: string;
      readonly patternId: string;
      readonly chartId: string;
    }
  | { readonly name: 'notFound' };

const enc = encodeURIComponent;

export const paths = {
  projects: () => '/',
  new: () => '/nowy',
  newKind: () => '/nowy/rodzaj',
  settings: () => '/ustawienia',
  import: (id?: string) => (id ? `/projekt/${enc(id)}/import` : '/import'),
  project: (id: string) => `/projekt/${enc(id)}`,
  parts: (id: string) => `/projekt/${enc(id)}/czesci`,
  tracker: (id: string, patternId: string) => `/projekt/${enc(id)}/wzor/${enc(patternId)}`,
  pattern: (id: string, patternId: string) => `/projekt/${enc(id)}/wzor/${enc(patternId)}/edycja`,
  chart: (id: string, patternId: string, chartId: string) =>
    `/projekt/${enc(id)}/wzor/${enc(patternId)}/schemat/${enc(chartId)}`,
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
  if (pathname === '/nowy/rodzaj') return { name: 'newKind' };
  if (pathname === '/ustawienia') return { name: 'settings' };
  if (pathname === '/import') return { name: 'import' };
  const m =
    /^\/projekt\/([^/]+)(?:\/(import|czesci)|\/wzor\/([^/]+)(?:\/(edycja)|\/schemat\/([^/]+))?)?$/.exec(
      pathname,
    );
  if (!m) return { name: 'notFound' };
  const [id, patternId, chartId] = decode([m[1], m[3], m[5]]) ?? [];
  if (!id) return { name: 'notFound' };
  if (m[2] === 'czesci') return { name: 'parts', id };
  if (m[2]) return { name: 'import', id };
  if (m[3] === undefined) return { name: 'project', id };
  if (!patternId) return { name: 'notFound' };
  if (m[4]) return { name: 'pattern', id, patternId };
  if (m[5] !== undefined)
    return chartId ? { name: 'chart', id, patternId, chartId } : { name: 'notFound' };
  return { name: 'tracker', id, patternId };
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
