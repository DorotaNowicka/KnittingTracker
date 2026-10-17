/**
 * Trusted Types (NFR-5, M6). The CSP says `require-trusted-types-for 'script'; trusted-types
 * default`: no HTML or script string ever reaches a DOM sink, and script URLs (the service worker
 * and the import worker, also when a library such as workbox-window passes a plain string) must go
 * through this one policy, which accepts only this app's own scripts.
 *
 * Imported first in main.tsx, before anything can touch a sink.
 */

/** Same-origin service worker or hashed build chunk; nothing else may be loaded as a script. */
export function isAllowedScriptUrl(url: string, origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return false;
  }
  return (
    parsed.origin === origin &&
    parsed.search === '' &&
    parsed.hash === '' &&
    /^\/(sw\.js|assets\/[\w.-]+\.js)$/.test(parsed.pathname)
  );
}

interface TrustedTypePolicyFactoryLike {
  createPolicy(
    name: string,
    rules: {
      createHTML?: (input: string) => string | null;
      createScript?: (input: string) => string | null;
      createScriptURL?: (input: string) => string | null;
    },
  ): unknown;
}

export function installTrustedTypesPolicy(): void {
  const tt = (globalThis as { trustedTypes?: TrustedTypePolicyFactoryLike }).trustedTypes;
  if (!tt) return; // Browsers without Trusted Types ignore the CSP directive as well.
  try {
    tt.createPolicy('default', {
      // Returning null rejects: no HTML strings and no eval-like script strings, ever.
      createHTML: () => null,
      createScript: () => null,
      createScriptURL: (input) => (isAllowedScriptUrl(input, location.origin) ? input : null),
    });
  } catch (error) {
    // Already created (hot reload in development).
    console.warn('[trusted-types] policy not installed', error);
  }
}

installTrustedTypesPolicy();
