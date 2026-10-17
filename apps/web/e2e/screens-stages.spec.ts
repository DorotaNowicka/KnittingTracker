import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createProjectFromFile, stagesPattern } from './fixtures';

// Screenshot tour of the M5 screens for the milestone report (synthetic pattern only).
// Runs only with KT_SCREENS=<output dir>.
const out = process.env.KT_SCREENS;

async function openPanel(page: Page) {
  const toggle = page.getByRole('button', { name: 'Pokaż panel' });
  if (await toggle.isVisible()) await toggle.click();
}

const backup = () => {
  const now = '2026-10-17T08:00:00.000Z';
  return JSON.stringify({
    format: 'knitting-tracker/backup',
    schemaVersion: 2,
    exportedAt: now,
    patterns: [{ id: 'e2e-stages', pattern: stagesPattern, source: 'file', importedAt: now }],
    projects: [
      {
        id: 'restored',
        name: 'Kamizelka z kopii',
        patternId: 'e2e-stages',
        patternRevision: 1,
        sizeIndex: 0,
        activeStageId: 'body',
        modifications: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    progress: [],
  });
};

for (const scheme of ['light', 'dark'] as const) {
  test(`stage screens (${scheme})`, async ({ page }, testInfo) => {
    test.skip(!out || testInfo.project.name === 'phone-ios', 'screens only on request');
    if (!out) return;
    mkdirSync(out, { recursive: true });
    const name = (n: string) => `${out}/${testInfo.project.name}-${scheme}-${n}.png`;
    await page.emulateMedia({ colorScheme: scheme });

    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    for (let i = 0; i < 4; i++) await page.getByTestId('complete-row').click();
    await page.getByRole('button', { name: 'Dalej: Przód' }).first().click();
    await expect(page.getByRole('combobox', { name: 'Etap' })).toHaveValue('front');
    for (let i = 0; i < 2; i++) await page.getByTestId('complete-row').click();
    await page.getByTestId('grid').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
    await openPanel(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: name('1-stage-panel') });

    await page.getByRole('button', { name: 'Ustaw', exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: name('2-position') });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Zakończ etap' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: name('3-finish') });
    await page
      .getByRole('dialog', { name: /Zakończyć etap/ })
      .getByRole('button', { name: 'Zakończ etap' })
      .click();
    await expect(page.getByTestId('row-counter')).toBeVisible();
    await page.getByRole('button', { name: 'Dodaj rząd' }).click();
    await page.getByRole('button', { name: 'Dodaj rząd' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: name('4-row-counter') });

    await page.goto('/wzory');
    await page
      .getByRole('link', { name: /Kamizelka etapowa/ })
      .first()
      .click();
    await page.getByRole('link', { name: /Przód/ }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Przód');
    await page.waitForTimeout(300);
    await page.screenshot({ path: name('5-stage-editor'), fullPage: true });

    await page.goto('/ustawienia');
    await page.getByTestId('restore-input').setInputFiles({
      name: 'kopia.ktbackup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup()),
    });
    await expect(page.getByTestId('restore-summary')).toBeVisible();
    await page.getByTestId('restore-summary').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: name('6-restore') });
    await page.getByText(/^KnittingTracker \d/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: name('7-settings-version') });

    await page.goto('/wzor/e2e-stages');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('heading', { name: 'Etapy i układ okrążenia' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: name('8-pattern-stages') });
  });
}
