import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createProjectFromFile, projectIdOf, stagesPattern } from './fixtures';

// Screenshot tour of the project → pattern → chart screens for the report (synthetic content
// only). Runs only with KT_SCREENS=<output dir>.
const out = process.env.KT_SCREENS;

async function openPanel(page: Page) {
  const toggle = page.getByRole('button', { name: 'Pokaż panel' });
  if (await toggle.isVisible()) await toggle.click();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`project and pattern screens (${scheme})`, async ({ page }, testInfo) => {
    test.skip(!out || testInfo.project.name === 'phone-ios', 'screens only on request');
    if (!out) return;
    test.setTimeout(120_000);
    mkdirSync(out, { recursive: true });
    const name = (n: string) => `${out}/${testInfo.project.name}-${scheme}-${n}.png`;
    await page.emulateMedia({ colorScheme: scheme });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: name('0-empty') });

    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    const id = projectIdOf(page);
    for (let i = 0; i < 2; i++) await page.getByTestId('complete-row').click();
    await page.goto('/nowy');
    await page.getByRole('button', { name: 'Użyj przykładowego projektu' }).click();
    await page.getByRole('button', { name: 'Utwórz projekt' }).click();
    await expect(page.getByTestId('grid')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('.project-list > li')).toHaveCount(2);
    await page.screenshot({ path: name('1-projects') });

    await page.goto(`/projekt/${id}`);
    await expect(page.getByTestId('pattern-list')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: name('2-project') });
    await page.screenshot({ path: name('2-project-full'), fullPage: true });

    await page.getByRole('button', { name: 'Dodaj wzór' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: name('3-add-pattern') });
    await page.keyboard.press('Escape');

    await page.goto(`/projekt/${id}/wzor/front/edycja`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Przód');
    await page.waitForTimeout(400);
    await page.screenshot({ path: name('4-pattern') });
    await page.screenshot({ path: name('4-pattern-full'), fullPage: true });

    await page.goto(`/projekt/${id}/wzor/body`);
    await expect(page.getByTestId('grid')).toBeVisible();
    await openPanel(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: name('5-tracker') });

    await page.goto('/nowy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: name('6-new') });
  });
}
