import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { syntheticPdf, syntheticPng } from './synthetic';

// Screenshot tour of the import screens for the milestone report (synthetic files only).
// Runs only with KT_SCREENS=<output dir>.
const out = process.env.KT_SCREENS;

for (const scheme of ['light', 'dark'] as const) {
  test(`import screens (${scheme})`, async ({ page }, testInfo) => {
    test.skip(!out || testInfo.project.name === 'phone-ios', 'screens only on request');
    if (!out) return;
    mkdirSync(out, { recursive: true });
    await page.emulateMedia({ colorScheme: scheme });
    const shot = (n: string) =>
      page.screenshot({ path: `${out}/${testInfo.project.name}-${scheme}-${n}.png` });
    await page.goto('/import');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot('1-import');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'wzor.pdf',
      mimeType: 'application/pdf',
      buffer: syntheticPdf().buffer,
    });
    await expect(page.getByText(/Znaleziono/)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot('2-legend');
    const review = page.locator('.review').nth(1);
    await review.scrollIntoViewIfNeeded();
    await page.getByTestId('review-grid-1').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await review.screenshot({ path: `${out}/${testInfo.project.name}-${scheme}-3-review.png` });

    await page.getByRole('button', { name: 'Inny plik' }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'zdjecie.png',
      mimeType: 'image/png',
      buffer: syntheticPng(true).buffer,
    });
    await expect(page.getByRole('heading', { name: 'Wyprostuj zdjęcie' })).toBeVisible();
    await shot('4-straighten');
    await page.getByRole('button', { name: 'Bez prostowania' }).click();
    await expect(page.getByText(/Znaleziono/)).toBeVisible({ timeout: 30_000 });
    const first = page.locator('.review').first();
    await first.scrollIntoViewIfNeeded();
    const next = first.getByRole('button', { name: 'Następna niepewna kratka' });
    if (await next.isEnabled()) await next.click();
    await page.waitForTimeout(300);
    await first.screenshot({ path: `${out}/${testInfo.project.name}-${scheme}-5-uncertain.png` });
  });
}
