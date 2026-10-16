import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { watchCsp } from './fixtures';
import { syntheticPdf, syntheticPng } from './synthetic';

test.describe('import from a PDF or a picture', () => {
  test('PDF → legend and charts recognised → fix a cell → pattern → knit; nothing leaves the device', async ({
    page,
  }, testInfo) => {
    test.slow();
    const csp = await watchCsp(page);
    await page.goto('/import');
    await expect(page.getByRole('heading', { level: 1, name: 'Import wzoru' })).toBeVisible();
    // From here on, every request is recorded: only the app's own files may be fetched.
    const requests: { method: string; url: string }[] = [];
    page.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));

    const pdf = syntheticPdf();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'wzor.pdf', mimeType: 'application/pdf', buffer: pdf.buffer });
    await expect(page.getByText('Znaleziono 2 schematy. Sprawdź je z oryginałem.')).toBeVisible({
      timeout: 30_000,
    });

    // Legend: three symbols understood from the text.
    const legend = page.locator('.legend-review__item');
    await expect(legend).toHaveCount(3);
    await expect(legend.nth(2).getByLabel('Symbol')).toHaveValue('cable:2-2-lc');

    // Charts: titles from the text layer, every cell recognised with confidence.
    await expect(page.getByLabel('Nazwa schematu').nth(0)).toHaveValue('B.1');
    await expect(page.getByLabel('Nazwa schematu').nth(1)).toHaveValue('B.2');
    await expect(page.getByText('Wszystkie kratki rozpoznane pewnie.')).toHaveCount(2);
    await expect(page.locator('.review__original')).toHaveCount(2);

    // Quick fix with the keyboard: select a cell, pick another symbol, then put it back.
    const grid = page.getByTestId('review-grid-0');
    await grid.focus();
    await grid.press('ArrowLeft'); // cursor appears at row 1, the rightmost cell
    const status = page.locator('.review__choices .hint').first();
    await expect(status).toContainText('Rząd 1, oczko 1');
    const before = (await status.innerText()).includes('lewe') ? 'lewe' : 'prawe';
    const other = before === 'lewe' ? /^prawe/ : /^lewe/;
    await page.locator('.review').first().getByRole('button', { name: other }).first().click();
    await expect(status).not.toContainText(`: ${before}`);
    await page
      .locator('.review')
      .first()
      .getByRole('button', { name: before === 'lewe' ? /^lewe/ : /^prawe/ })
      .first()
      .click();
    await expect(status).toContainText(`: ${before}`);

    // Description from the same file.
    await expect(page.locator('.facts')).toContainText('S – M');
    await expect(page.locator('.facts .chip')).toHaveCount(3);
    await expect(page.locator('.facts')).toContainText('18-22');

    if (testInfo.project.name === 'desktop') {
      const axe = await new AxeBuilder({ page }).exclude('[data-testid^="review-grid"]').analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    }

    await page.getByLabel('Nazwa wzoru').fill('Wzór z importu');
    await page.getByRole('button', { name: 'Utwórz wzór' }).click();
    await expect(page).toHaveURL(/\/wzor\//);
    await expect(page.getByRole('heading', { level: 1, name: 'Wzór z importu' })).toBeVisible();
    await expect(page.locator('.card--row')).toContainText('oczka: 18-22');
    await expect(page.getByRole('button', { name: 'Zacznij dziergać' })).toBeEnabled();

    // Nothing was sent anywhere: only GETs of the app's own assets (the lazy import code).
    const origin = new URL(page.url()).origin;
    const foreign = requests.filter((r) => r.method !== 'GET' || !r.url.startsWith(origin));
    expect(foreign).toEqual([]);
    expect(requests.filter((r) => !/\/(assets|icons)\/|\/wzor\//.test(r.url))).toEqual([]);
    expect(await csp()).toEqual([]);

    // Knit it.
    await page.getByRole('button', { name: 'Zacznij dziergać' }).click();
    await page.getByRole('button', { name: 'Utwórz projekt' }).click();
    await expect(page.getByTestId('grid')).toBeVisible();
  });

  test('a picture: straighten step, recognition, file checks', async ({ page }) => {
    test.slow();
    await page.goto('/import');
    // Wrong type and size are refused before anything is read.
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
    await expect(
      page.getByRole('alert').filter({ hasText: 'To nie jest PDF ani obraz' }),
    ).toBeVisible();

    const png = syntheticPng();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'schemat.png', mimeType: 'image/png', buffer: png.buffer });
    await expect(page.getByRole('heading', { name: 'Wyprostuj zdjęcie' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Narożnik/ })).toHaveCount(4);
    // Keyboard nudging of a corner.
    await page.getByRole('button', { name: /Narożnik: lewy górny/ }).press('ArrowRight');
    await page.getByRole('button', { name: 'Bez prostowania' }).click();
    await expect(page.getByText('Znaleziono 1 schemat. Sprawdź go z oryginałem.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(`${png.chart.width} × ${png.chart.height}`).first()).toBeVisible();
    // No legend in a picture: the symbol list can be narrowed and recognition re-run.
    await expect(page.getByRole('heading', { name: 'Symbole w schematach' })).toBeVisible();
    await page
      .getByRole('checkbox', { name: /narzut/ })
      .uncheck()
      .catch(() => undefined);
    await page.getByRole('button', { name: 'Inny plik' }).click();
    await expect(page.getByText('Wybierz PDF lub zdjęcie')).toBeVisible();

    // The same picture through crop & straighten (corners slightly inside the image edge).
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'zdjecie.png', mimeType: 'image/png', buffer: png.buffer });
    await page.getByRole('button', { name: 'Wyprostuj i rozpoznaj' }).click();
    await expect(page.getByText('Znaleziono 1 schemat. Sprawdź go z oryginałem.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(`${png.chart.width} × ${png.chart.height}`).first()).toBeVisible();
  });
});
