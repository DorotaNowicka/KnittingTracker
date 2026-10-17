import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';
import { createProjectFromFile, testPattern } from './fixtures';

/**
 * DoD: progress survives an app update. The build is copied to a temporary folder and served by a
 * small static server of its own (so other tests never see the update). After progress is made,
 * the service worker file changes as in a new release; the app must offer the update, never reload
 * by itself, and keep the progress after the knitter accepts it.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function serve(root: string): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
    let file = join(root, path);
    try {
      if (!file.startsWith(root) || !statSync(file).isFile()) throw new Error('not a file');
    } catch {
      if (extname(path)) {
        res.writeHead(404).end();
        return;
      }
      file = join(root, 'index.html'); // SPA fallback
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

test('progress survives an app update that the knitter accepts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough');
  const root = mkdtempSync(join(tmpdir(), 'kt-update-'));
  cpSync(new URL('../dist/', import.meta.url).pathname, root, { recursive: true });
  const { server, url } = await serve(root);
  try {
    // createProjectFromFile navigates with relative URLs: use this server as the base.
    await page.goto(url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const base = page.url().replace(/\/$/, '');
    await createProjectFromFile(page, testPattern, 'Przed aktualizacją', 1, base);
    await page.getByTestId('complete-row').click();
    await expect(page.getByTestId('status-detail')).toContainText('razem 26');
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    // "Release" a new version: the service worker script changes.
    const sw = join(root, 'sw.js');
    writeFileSync(sw, `${readFileSync(sw, 'utf8')}\n// release ${Date.now()}\n`);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });

    // The app asks first and keeps working meanwhile.
    const banner = page.getByRole('status').filter({ hasText: 'Jest nowa wersja aplikacji' });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('status-detail')).toContainText('razem 26');
    await page.getByTestId('complete-row').click();
    await expect(page.getByTestId('status-detail')).toContainText('razem 52');

    await page.getByRole('button', { name: 'Zaktualizuj teraz' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByTestId('status-detail')).toContainText('razem 52');
    await expect(banner).toHaveCount(0);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
