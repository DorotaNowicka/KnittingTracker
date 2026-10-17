import { expect, test } from '@playwright/test';
import { createProjectFromFile, stagesPattern, testPattern, watchCsp } from './fixtures';
import { syntheticPdf, syntheticPng } from './synthetic';

// Security hardening (M6): the production CSP with Trusted Types is enforced on every page, and
// the app's own flows (service worker, import worker, canvas, storage) cause no violation.
test.describe('security headers and policies', () => {
  test('Trusted Types and CSP block HTML injection, the app runs without violations', async ({
    page,
  }) => {
    const csp = await watchCsp(page);
    const response = await page.goto('/');
    const policy = response?.headers()['content-security-policy'] ?? '';
    expect(policy).toContain("require-trusted-types-for 'script'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe');

    // Real flows: service worker registration, the import worker (pdf.js), the tracker.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    expect(await csp()).toEqual([]);
    await page.goto('/import');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'wzor.pdf',
      mimeType: 'application/pdf',
      buffer: syntheticPdf().buffer,
    });
    await expect(page.getByText(/Znaleziono/)).toBeVisible({ timeout: 30_000 });
    expect(await csp()).toEqual([]);
    await createProjectFromFile(page, testPattern);
    expect(await csp()).toEqual([]);

    // Deliberate probes last (each page load starts a fresh violation list).
    const sinks = await page.evaluate(() => {
      const el = document.createElement('div');
      const result: Record<string, string> = {};
      try {
        el.innerHTML = '<img src=x onerror=alert(1)>';
        result.innerHTML = 'allowed';
      } catch {
        result.innerHTML = 'blocked';
      }
      try {
        const s = document.createElement('script');
        s.src = 'https://evil.example/x.js';
        result.scriptSrc = 'allowed';
      } catch {
        result.scriptSrc = 'blocked';
      }
      return result;
    });
    expect(sinks).toEqual({ innerHTML: 'blocked', scriptSrc: 'blocked' });
    // eval: Playwright's own evaluation bypasses CSP, so it is checked in the policy instead
    // (no 'unsafe-eval' above); zod runs jitless and pdf.js with isEvalSupported: false.
  });

  test('headers and caching (when served by nginx)', async ({ request }) => {
    test.skip(!process.env.E2E_BASE_URL, 'nginx headers are checked against the real server');
    const root = await request.get('/');
    expect(root.headers()['cache-control']).toBe('no-cache');
    expect(root.headers()['x-content-type-options']).toBe('nosniff');
    expect(root.headers()['referrer-policy']).toBe('no-referrer');
    expect(root.headers()['cross-origin-opener-policy']).toBe('same-origin');
    expect(root.headers()['server'] ?? '').not.toMatch(/\d/);
    const sw = await request.get('/sw.js');
    expect(sw.headers()['cache-control']).toBe('no-cache');
    const html = await root.text();
    const asset = /\/assets\/[\w.-]+\.js/.exec(html)?.[0];
    expect(asset).toBeTruthy();
    const js = await request.get(asset ?? '');
    expect(js.headers()['cache-control']).toContain('immutable');
    expect(js.headers()['content-security-policy']).toContain('trusted-types');
    // A missing file is a real 404, never the app shell.
    expect((await request.get('/assets/missing.js')).status()).toBe(404);
    // Client-side routes fall back to the app.
    expect((await request.get('/projekt/abc')).status()).toBe(200);
    expect((await request.get('/healthz')).status()).toBe(200);
  });
});

/**
 * Safari reports even script-set inline styles under `style-src 'self'` (seen in CI on WebKit).
 * The app therefore sets no inline styles at all; Chromium shows any that sneak in as a `style`
 * attribute, which this test looks for on every screen that draws something dynamic.
 */
test('no inline styles anywhere (strict style-src works in Safari too)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport');
  const styled = async (where: string) =>
    (
      await page.evaluate(() =>
        [...document.querySelectorAll('[style]')].map(
          (el) => `${el.tagName.toLowerCase()}.${el.className}`,
        ),
      )
    ).map((x) => `${where}: ${x}`);
  const found: string[] = [];

  await page.goto('/import');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wzor.pdf',
    mimeType: 'application/pdf',
    buffer: syntheticPdf().buffer,
  });
  await expect(page.getByText(/Znaleziono/)).toBeVisible({ timeout: 30_000 });
  found.push(...(await styled('import review')));
  await page.getByRole('button', { name: 'Inny plik' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'zdjecie.png',
    mimeType: 'image/png',
    buffer: syntheticPng().buffer,
  });
  await expect(page.getByRole('heading', { name: 'Wyprostuj zdjęcie' })).toBeVisible();
  found.push(...(await styled('straighten')));

  await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
  found.push(...(await styled('tracker')));
  for (const path of [
    '/',
    '/wzory',
    '/wzor/e2e-stages',
    '/wzor/e2e-stages/etap/front',
    '/ustawienia',
  ]) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(200);
    found.push(...(await styled(path)));
  }
  await page.goto('/wzor/e2e-stages/schemat/rope');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  found.push(...(await styled('chart editor')));
  expect(found).toEqual([]);
});
