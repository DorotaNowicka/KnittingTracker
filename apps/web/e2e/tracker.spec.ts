import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createProjectFromFile, tapCell, testPattern, watchCsp } from './fixtures';

const detail = (page: Page) => page.getByTestId('status-detail');

test.describe('tracking a pattern from a file', () => {
  test('import → tap → reload keeps progress → works offline', async ({ page, context }) => {
    const csp = await watchCsp(page);
    await createProjectFromFile(page, testPattern);
    await expect(detail(page)).toContainText('Nic jeszcze nie zrobione');

    // Size M: 26 stitches per round. Display column 26 is stitch 1 (rightmost).
    await tapCell(page, 1, 20); // stitch 7
    await expect(detail(page)).toContainText('okrążenie 1, oczko 7 (Przód), razem 7');

    // A tap on a done stitch never removes work.
    await tapCell(page, 1, 24);
    await expect(detail(page)).toContainText('razem 7');

    await page.reload();
    await expect(detail(page)).toContainText('okrążenie 1, oczko 7 (Przód), razem 7');

    // Make sure the service worker controls the page, then go offline.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(detail(page)).toContainText('razem 7');
    await tapCell(page, 2, 26);
    await expect(detail(page)).toContainText('okrążenie 2, oczko 1');
    await context.setOffline(false);
    expect(await csp()).toEqual([]);
  });

  test('buttons and shortcuts: row done, undo, redo, eraser', async ({ page }) => {
    await createProjectFromFile(page, testPattern);
    const rowDone = page.getByRole('button', { name: 'Ukończ okrążenie' });
    await rowDone.click();
    await expect(detail(page)).toContainText('razem 26');
    await page.getByTestId('grid').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect(detail(page)).toContainText('okrążenie 2, oczko 2');
    await page.keyboard.press('Control+z');
    await expect(detail(page)).toContainText('okrążenie 2, oczko 1');
    await page.getByRole('button', { name: 'Ponów' }).click();
    await expect(detail(page)).toContainText('okrążenie 2, oczko 2');

    const eraser = page.getByRole('button', { name: /^Gumka/ });
    await eraser.click();
    await expect(eraser).toHaveAttribute('aria-pressed', 'true');
    await expect(eraser).toHaveText(/Gumka włączona/);
    await tapCell(page, 1, 16); // stitch 11 of round 1
    await expect(detail(page)).toContainText('okrążenie 1, oczko 11');
    await page.getByRole('button', { name: 'Cofnij' }).click();
    await expect(detail(page)).toContainText('okrążenie 2, oczko 2');
  });

  test('a flat pattern starts on the wrong side and reads left to right', async ({ page }) => {
    await createProjectFromFile(page, testPattern);
    await page.getByRole('combobox', { name: 'Wzór' }).selectOption('back');
    await expect(page).toHaveURL(/\/wzor\/back$/);
    await expect(page.getByText('Lewa strona').first()).toBeVisible();
    // Row 1 is WS: the first stitch worked is the leftmost one (display column 1 = stitch 10).
    await tapCell(page, 1, 1);
    await expect(detail(page)).toContainText('rząd 1, oczko 10, razem 1');
  });

  test('screens have no axe violations', async ({ page }) => {
    const check = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    };
    await createProjectFromFile(page, testPattern);
    await page.waitForTimeout(300);
    await check();
    const panel = page.getByRole('button', { name: 'Pokaż panel' });
    if (await panel.count()) await panel.click();
    await check();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await check();
    await page.getByRole('link', { name: /Projekt testowy/ }).click();
    await expect(page.getByTestId('pattern-list')).toBeVisible();
    await check();
    await page.goto('/nowy');
    await page.getByRole('button', { name: 'Użyj przykładowego projektu' }).click();
    await check();
    await page.goto('/ustawienia');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await check();
  });
});
