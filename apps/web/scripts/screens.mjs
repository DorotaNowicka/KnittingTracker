// Screenshot tour for milestone reports (spec F4): 3 viewports × 2 themes over the main screens.
// Usage: pnpm build && pnpm preview & node scripts/screens.mjs [baseUrl] [outDir]
// Uses only the synthetic sample pattern, so the images may be shared.
import { mkdirSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'screens';
mkdirSync(out, { recursive: true });

const viewports = {
  phone: { ...devices['Pixel 7'] },
  tablet: {
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const problems = [];
for (const [name, vp] of Object.entries(viewports)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...vp, colorScheme: scheme, locale: 'pl-PL' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${name}/${scheme}: ${e.message}`));
    page.on(
      'console',
      (m) => m.type() === 'error' && problems.push(`${name}/${scheme}: ${m.text()}`),
    );
    const shot = (label) => page.screenshot({ path: `${out}/${name}-${scheme}-${label}.png` });

    await page.goto(base);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await shot('1-empty');

    await page.getByRole('button', { name: 'Wypróbuj przykładowy wzór' }).click();
    await page.getByTestId('grid').waitFor();
    await page.waitForTimeout(400);
    await shot('2-tracker-start');

    const done = page.getByRole('button', { name: /Ukończ okrążenie/ });
    for (let i = 0; i < 5; i++) await done.click();
    const grid = page.getByTestId('grid');
    const box = await grid.boundingBox();
    // Tap a few stitches into the next round (right part of the visible grid, current row).
    if (box) await page.keyboard.press('Space');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await shot('3-tracker-progress');

    const panelBtn = page.getByRole('button', { name: /Pokaż panel/ });
    if (await panelBtn.count()) await panelBtn.click();
    await page.waitForTimeout(250);
    await shot('4-tracker-panel');

    await page.goto(`${base}/`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await shot('5-projects');
    await page.goto(`${base}/nowy`);
    await page.getByRole('button', { name: 'Użyj przykładowego wzoru' }).click();
    await page.getByRole('button', { name: 'Utwórz projekt' }).waitFor();
    await shot('6-new-project');
    await page.goto(`${base}/ustawienia`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await shot('7-settings');

    // M3: pattern library, pattern editor, chart editor, layout wizard (sample pattern only).
    await page.goto(`${base}/wzory`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await shot('8-patterns');
    await page
      .getByRole('link', { name: /Przykład: warkocze/ })
      .first()
      .click();
    await page.getByRole('heading', { level: 2, name: 'Schematy' }).waitFor();
    await page.waitForTimeout(300);
    await shot('9-pattern');
    await page
      .getByRole('link', { name: /Ścieżka/ })
      .first()
      .click();
    await page.getByTestId('chart-editor').waitFor();
    await page.getByRole('radio', { name: 'Zaznacz' }).check();
    await page.getByTestId('chart-editor').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(400);
    await shot('10-chart-editor');
    await page.getByRole('link', { name: 'Wróć do wzoru' }).click();
    await page.getByRole('link', { name: 'Ustaw układ' }).first().click();
    await page.getByTestId('stage-preview').waitFor();
    await page.waitForTimeout(400);
    await shot('11-layout');
    await page.getByRole('heading', { level: 2, name: 'Podgląd siatki' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot('12-layout-preview');
    await ctx.close();
  }
}
await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`screens written to ${out}`);
