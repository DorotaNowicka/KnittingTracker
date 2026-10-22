import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { continueKnitting, createProjectFromFile, stagesPattern, tapCell } from './fixtures';

const detail = (page: Page) => page.getByTestId('status-detail');

/** Open the side panel (a sheet on phones and tablets, a column on wide screens). */
async function openPanel(page: Page) {
  const toggle = page.getByRole('button', { name: 'Pokaż panel' });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole('complementary', { name: /legenda/ })).toBeVisible();
}

/** On phones and tablets the panel covers the grid: close it before tapping cells. */
async function closePanelOverlay(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1100) return;
  await page.getByRole('button', { name: 'Ukryj panel' }).first().click();
}

const chartRows = (page: Page) => page.getByTestId('chart-rows').first();

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

test.describe('patterns of a project', () => {
  test('round body → flat front: the rope continues across patterns, then a row counter', async ({
    page,
  }) => {
    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    await openPanel(page);
    await expect(chartRows(page)).toContainText('Warkocz');
    await expect(chartRows(page)).toContainText('rząd 1 z 6');

    // Body: 4 planned rounds of 20 stitches.
    const roundDone = page.getByTestId('complete-row');
    for (let i = 0; i < 4; i++) await roundDone.click();
    await expect(detail(page)).toContainText('Wzór ukończony');
    await page.getByRole('button', { name: 'Dalej: Przód' }).first().click();

    // Front: flat, rope continues with chart row 5 (after rounds 1–4).
    await expect(page.getByRole('combobox', { name: 'Wzór' })).toHaveValue('front');
    await expect(detail(page)).toContainText('Prawa strona');
    await openPanel(page);
    await expect(chartRows(page)).toContainText('rząd 5 z 6');
    await expect(page.getByTestId('estimate')).toContainText(
      'Ok. 0 z 10 cm, zostaje ok. 30 rzędów',
    );

    // Row 1 is RS: the first stitch is the rightmost one (display column 10 = stitch 1); row 2
    // is WS and starts on the left.
    await closePanelOverlay(page);
    await tapCell(page, 1, 10);
    await expect(detail(page)).toContainText('rząd 1, oczko 1, razem 1');
    for (let i = 0; i < 3; i++) await page.getByTestId('complete-row').click();
    await openPanel(page);
    await expect(page.getByTestId('estimate')).toContainText('z 10 cm');
    await expect(page.getByTestId('estimate')).toContainText('27 rzędów');

    // Finish the open-ended front after 3 rows: the dialog shows the last chart row (5, 6, 1 → 1).
    await page.getByRole('button', { name: 'Zakończ wzór' }).click();
    const finish = page.getByRole('dialog', { name: /Zakończyć wzór/ });
    await expect(finish).toContainText('po 3 rzędach');
    await expect(finish.getByTestId('chart-rows')).toContainText('rząd 1 z 6');
    await axeClean(page);
    await finish.getByRole('button', { name: 'Zakończ wzór' }).click();

    // Ribbing: row counter only, no grid.
    await expect(page.getByRole('combobox', { name: 'Wzór' })).toHaveValue('rib');
    await expect(page.getByTestId('row-counter')).toHaveText(/^0\s*\/\s*6$/);
    await page.getByRole('button', { name: 'Dodaj rząd' }).click();
    await page.getByTestId('complete-row').click();
    await expect(page.getByTestId('row-counter')).toHaveText(/^2\s*\/\s*6$/);
    await page.getByRole('button', { name: 'Odejmij rząd' }).click();
    await expect(page.getByTestId('row-counter')).toHaveText(/^1\s*\/\s*6$/);

    // Everything survives a reload, including the finished front.
    await page.reload();
    await expect(page.getByTestId('row-counter')).toHaveText(/^1\s*\/\s*6$/);
    await page.getByRole('combobox', { name: 'Wzór' }).selectOption('front');
    await expect(detail(page)).toContainText('Wzór zakończony po 3 rzędach');
    await openPanel(page);
    await page.getByRole('button', { name: 'Wznów wzór' }).click();
    await expect(detail(page)).toContainText('rząd 3, oczko');
  });

  test('manual position entry (DR-8) is undoable', async ({ page }) => {
    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    await page.getByRole('button', { name: 'Ustaw', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Gdzie jesteś?' });
    await dialog.getByLabel('Okrążenie').fill('3');
    await dialog.getByLabel('Zrobione oczka').fill('5');
    await expect(dialog).toContainText('okrążenie 3, oczko 5 (razem 45)');
    await axeClean(page);
    await dialog.getByRole('button', { name: 'Ustaw' }).click();
    await expect(detail(page)).toContainText('okrążenie 3, oczko 5');
    await expect(detail(page)).toContainText('razem 45');
    await page.getByRole('button', { name: 'Cofnij' }).click();
    await expect(detail(page)).toContainText('Nic jeszcze nie zrobione');

    // Keyboard: G opens the same dialog.
    await page.getByTestId('grid').focus();
    await page.keyboard.press('g');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('backup → delete → restore brings the project back with its progress', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'file download flow checked on desktop');
    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    await page.getByTestId('complete-row').click();
    await expect(detail(page)).toContainText('razem 20');

    await page.goto('/ustawienia');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Zapisz kopię zapasową' }).click(),
    ]);
    const path = await download.path();
    const text = readFileSync(path, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ format: 'knitting-tracker/backup', schemaVersion: 3 });

    await page.goto('/');
    await page.getByRole('button', { name: 'Usuń projekt Kamizelka' }).click();
    await page.getByRole('button', { name: 'Usuń projekt', exact: true }).click();
    await expect(page.getByText('Kamizelka')).toHaveCount(0);

    await page.goto('/ustawienia');
    await page.getByTestId('restore-input').setInputFiles({
      name: 'kopia.ktbackup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    const summary = page.getByTestId('restore-summary');
    await expect(summary).toBeVisible();
    await expect(summary.getByRole('row', { name: /Projekty/ })).toContainText('1');
    await axeClean(page);
    await summary.getByRole('button', { name: 'Przywróć' }).click();
    await expect(page.getByText(/Przywrócono/)).toBeVisible();

    await continueKnitting(page, 'Kamizelka');
    await expect(detail(page)).toContainText('razem 20');

    // Restoring the same file again changes nothing.
    await page.goto('/ustawienia');
    await page.getByTestId('restore-input').setInputFiles({
      name: 'kopia.ktbackup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await expect(page.getByRole('button', { name: 'Nic do przywrócenia' })).toBeDisabled();
  });

  test('a layout change becomes a new pattern that continues the charts', async ({ page }) => {
    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    await page.getByRole('link', { name: 'Projekt Kamizelka' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kamizelka' })).toBeVisible();
    const list = page.getByTestId('pattern-list');
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await list.getByRole('button', { name: 'Dalej z tego wzoru' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Korpus — dalej');
    await expect(
      page.getByRole('radio', { name: 'Dziergaj dalej jak w innym wzorze' }).first(),
    ).toBeChecked();
    await expect(page.getByLabel('Kontynuuj').first()).toHaveValue(/body/);
    await axeClean(page);

    // The new pattern sits right after the body in the project.
    await page.getByRole('link', { name: 'Wróć do projektu' }).click();
    await expect(list.getByRole('listitem').nth(1)).toContainText('Korpus — dalej');
  });
});
