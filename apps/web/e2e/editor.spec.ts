import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { watchCsp } from './fixtures';

/** Centre of a chart-editor cell in page coordinates (non-prod test hook). */
async function cellPoint(page: Page, row: number, col: number) {
  // On phones the palette sits below the canvas: bring the canvas back into view first.
  await page.getByTestId('chart-editor').scrollIntoViewIfNeeded();
  const p = await page.evaluate(
    ([r, c]) => {
      const hook = (
        window as unknown as {
          __ktEditor?: {
            renderer: { reveal(r: number, c: number, m: string): void; draw(): void };
            pointOf(r: number, c: number): { x: number; y: number } | null;
          };
        }
      ).__ktEditor;
      if (!hook) return null;
      hook.renderer.reveal(r, c, 'nearest');
      hook.renderer.draw();
      return hook.pointOf(r, c);
    },
    [row, col] as const,
  );
  if (!p) throw new Error('editor test hook missing');
  return p;
}

async function paint(page: Page, symbol: RegExp, cells: readonly (readonly [number, number])[]) {
  await page.getByRole('radio', { name: 'Rysuj' }).check();
  await page.getByRole('button', { name: symbol }).first().click();
  for (const [r, c] of cells) {
    const p = await cellPoint(page, r, c);
    await page.mouse.click(p.x, p.y);
  }
}

async function dragSelect(page: Page, from: [number, number], to: [number, number]) {
  await page.getByRole('radio', { name: 'Zaznacz' }).check();
  const a = await cellPoint(page, ...from);
  const b = await cellPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
}

async function addChart(page: Page, name: string, w: number, h: number) {
  await page.getByRole('button', { name: 'Dodaj schemat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowy schemat' });
  await dialog.getByLabel('Nazwa schematu').fill(name);
  await dialog.getByLabel('Szerokość (oczka)').fill(String(w));
  await dialog.getByLabel('Wysokość (rzędy)').fill(String(h));
  await dialog.getByRole('button', { name: 'Utwórz i rysuj' }).click();
  await expect(page.getByTestId('chart-editor')).toBeVisible();
  await expect(page.getByText(`${w} × ${h}`)).toBeVisible();
}

async function backToPattern(page: Page) {
  await page.getByRole('link', { name: 'Wróć do wzoru' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Schematy' })).toBeVisible();
}

async function pickFromLibrary(page: Page, query: string, label: RegExp) {
  await page.getByRole('button', { name: 'Więcej' }).click();
  const dialog = page.getByRole('dialog', { name: 'Biblioteka symboli' });
  await dialog.getByLabel('Szukaj').fill(query);
  await dialog.getByRole('button', { name: label }).first().click();
}

/** Expected pattern content for the charts drawn below (RS view, row 1 first). */
const EXPECTED_ROWS = {
  ryz: ['kp', 'pk'],
  warkocz: ['pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pC...p'],
  sciezka: ['kppp', 'R.pp', 'pkpp', 'L.pp'],
};

test('build a 3-chart pattern from scratch, knit it, export it and import it again', async ({
  page,
}, testInfo) => {
  test.slow();
  const csp = await watchCsp(page);
  await page.goto('/wzory');
  await page.getByRole('button', { name: 'Nowy wzór' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mój wzór' })).toBeVisible();

  await page.getByLabel('Nazwa wzoru').fill('Sweter od zera');
  await page.getByRole('textbox', { name: 'Rozmiar 1' }).fill('S');
  await page.getByRole('button', { name: 'Dodaj rozmiar' }).click();
  await page.getByRole('textbox', { name: 'Rozmiar 2' }).fill('M');

  // Chart 1: seed stitch, drawn cell by cell.
  await addChart(page, 'Ryż', 2, 2);
  await paint(page, /^lewe/, [
    [1, 2],
    [2, 1],
  ]);
  await expect(page.getByText('Wszystko się zgadza.')).toBeHidden();
  await backToPattern(page);

  // Chart 2: a rope. Purl column by selection + fill, copied to the other edge; a cable on top.
  await addChart(page, 'Warkocz', 6, 6);
  await page.getByRole('button', { name: /^lewe/ }).first().click();
  await dragSelect(page, [1, 1], [6, 1]);
  await expect(page.getByText('Zaznaczono 1 × 6.')).toBeVisible();
  await page.getByRole('button', { name: 'Wypełnij' }).click();
  await page.getByRole('button', { name: 'Kopiuj' }).click();
  await dragSelect(page, [1, 6], [1, 6]);
  await page.getByRole('button', { name: 'Wklej' }).click();
  await pickFromLibrary(page, '2/2 w lewo', /krzyż 2\/2 w lewo(?! z)/);
  await paint(page, /krzyż 2\/2 w lewo/, [[6, 2]]);
  // Undo and redo the cable.
  await page.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }).click();
  await page.getByRole('button', { name: 'Ponów (Ctrl+Shift+Z)' }).click();
  await backToPattern(page);

  // Chart 3: a travelling stitch. All purl, then knit stitches and crossings; checked by mirror.
  await addChart(page, 'Ścieżka', 4, 4);
  await page.getByTestId('chart-editor').focus();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: /^lewe/ }).first().click();
  await page.getByRole('button', { name: 'Wypełnij' }).click();
  await page.getByRole('button', { name: 'Odznacz' }).click();
  await paint(page, /^prawe/, [
    [1, 1],
    [3, 2],
  ]);
  await pickFromLibrary(page, '1/1 w prawo z lewym', /krzyż 1\/1 w prawo z lewym/);
  await paint(page, /krzyż 1\/1 w prawo z lewym/, [[2, 1]]);
  // Row 4 = row 2 mirrored: copy row 2 to row 4 and mirror it there… then put it back in place.
  await dragSelect(page, [2, 1], [2, 2]);
  await page.getByRole('button', { name: 'Kopiuj' }).click();
  await dragSelect(page, [4, 1], [4, 1]);
  await page.getByRole('button', { name: 'Wklej' }).click();
  await page.getByRole('button', { name: 'Odbij w poziomie' }).click();
  // Mirroring swaps the order inside the selection: the crossing is now in columns 1–2 as LPC.
  await expect(page.getByText(/Problem|błąd/)).toHaveCount(0);
  await backToPattern(page);

  // Layout: Ryż (3/5) · Warkocz · Ścieżka · Warkocz | Tył: Ryż (3/5) · Warkocz.
  await page.getByRole('link', { name: 'Ustaw układ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Układ: Korpus' })).toBeVisible();
  const add = page.getByLabel('Dodaj schemat');
  for (const chart of ['Ryż (2×2)', 'Warkocz (6×6)', 'Ścieżka (4×4)', 'Warkocz (6×6)']) {
    await add.selectOption({ label: chart });
  }
  await page.getByRole('button', { name: 'Dodaj znacznik' }).click();
  for (const chart of ['Ryż (2×2)', 'Warkocz (6×6)']) await add.selectOption({ label: chart });
  const segments = page.locator('li.segment');
  await expect(segments).toHaveCount(8);
  await segments.nth(5).getByLabel('Nazwa części od tego znacznika').fill('Tył');
  await segments.nth(0).getByLabel('Nazwa części od tego znacznika').fill('Przód');
  for (const i of [1, 6]) {
    const seg = segments.nth(i);
    await seg.getByLabel(/Na innej liczbie oczek/).check();
    await seg.getByLabel('Inna wartość dla każdego rozmiaru').check();
    await seg.getByRole('textbox', { name: 'S', exact: true }).fill('3');
    await seg.getByRole('textbox', { name: 'M', exact: true }).fill('5');
  }
  await page.getByLabel('Znam liczbę rzędów etapu').check();
  await page.getByRole('group', { name: 'Rzędy' }).getByRole('textbox').fill('12');
  await page.getByLabel('Wzór podaje liczbę oczek').check();
  const expected = page.getByRole('group', { name: 'Oczka wg wzoru' });
  await expected.getByLabel('Inna wartość dla każdego rozmiaru').check();
  await expected.getByRole('textbox', { name: 'S', exact: true }).fill('28');
  await expected.getByRole('textbox', { name: 'M', exact: true }).fill('31');
  // A wrong count is reported inline…
  await expect(
    page.getByText('Rozmiar M: Korpus: układ ma 32 oczek, a wzór podaje 31.'),
  ).toBeVisible();
  await expected.getByRole('textbox', { name: 'M', exact: true }).fill('32');
  await expect(page.getByText(/układ ma 32 oczek/)).toBeHidden();
  await expect(page.getByTestId('stage-preview')).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    const axe = await new AxeBuilder({ page }).exclude('[data-testid="stage-preview"]').analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  }
  await page.getByRole('link', { name: 'Gotowe' }).click();

  // The pattern is valid: export it.
  await expect(page.getByRole('button', { name: 'Zacznij dziergać' })).toBeEnabled();
  await expect(page.locator('.notice--danger')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zapisz do pliku' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path()) ?? '', 'utf8')) as {
    format: string;
    pattern: {
      id: string;
      sizes: string[];
      charts: { id: string; name: string; palette: Record<string, string>; rows: string[] }[];
      stages: { expectedStitches: number[]; rows: number }[];
    };
  };
  expect(exported.format).toBe('knitting-tracker/pattern');
  expect(exported.pattern.sizes).toEqual(['S', 'M']);
  expect(exported.pattern.stages[0]).toMatchObject({ expectedStitches: [28, 32], rows: 12 });
  const asChars = (c: { palette: Record<string, string>; rows: string[] }) => {
    const sym: Record<string, string> = {
      'std:k': 'k',
      'std:p': 'p',
      'cable:2-2-lc': 'C',
      'cable:1-1-rpc': 'R',
      'cable:1-1-lpc': 'L',
    };
    return c.rows.map((row) =>
      [...row].map((ch) => (ch === '.' ? '.' : (sym[c.palette[ch] ?? ''] ?? '?'))).join(''),
    );
  };
  const byName = Object.fromEntries(exported.pattern.charts.map((c) => [c.id, asChars(c)]));
  expect(byName).toEqual(EXPECTED_ROWS);

  // Knit it (size M).
  await page.getByRole('button', { name: 'Zacznij dziergać' }).click();
  await page.getByLabel('Rozmiar').selectOption({ label: 'M' });
  await page.getByLabel('Nazwa projektu').fill('Mój sweter');
  await page.getByRole('button', { name: 'Utwórz projekt' }).click();
  await expect(page).toHaveURL(/\/projekt\//);
  await expect(page.getByTestId('grid')).toBeVisible();
  await page.getByRole('button', { name: /Ukończ okrążenie/ }).click();
  await expect(page.getByTestId('status-detail')).toContainText('okrążenie 1, oczko 32');

  // Import the exported file as a new project: the same pattern, not a copy.
  await page.goto('/nowy');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sweter.ktpattern.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole('heading', { level: 2, name: 'Sweter od zera' })).toBeVisible();
  await page.getByLabel('Rozmiar').selectOption({ label: 'S' });
  await page.getByLabel('Nazwa projektu').fill('Drugi sweter');
  await page.getByRole('button', { name: 'Utwórz projekt' }).click();
  await expect(page.getByTestId('grid')).toBeVisible();
  await expect(page.getByText('/ 28')).toBeVisible();

  await page.goto('/wzory');
  await expect(page.locator('.pattern-list > li')).toHaveCount(1);
  await expect(page.getByText('2 projekty')).toBeVisible();
  expect(await csp()).toEqual([]);
});

test('touch: a tap paints one cell and undo restores it', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch devices only');
  await page.goto('/wzory');
  await page.getByRole('button', { name: 'Nowy wzór' }).click();
  await addChart(page, 'Dotyk', 4, 3);
  await page.getByRole('button', { name: /^lewe/ }).first().click();
  const p = await cellPoint(page, 2, 3);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByText('Rząd 2, oczko 2 (licząc od prawej): lewe')).toBeVisible();
  await page.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }).click();
  await expect(page.getByText('Rząd 2, oczko 2 (licząc od prawej): prawe')).toBeVisible();
});
