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

/** "Start from scratch": a new project with one empty pattern, opened in the pattern editor. */
async function startFromScratch(page: Page) {
  await page.goto('/nowy');
  await page.getByRole('button', { name: 'Zacznij od zera' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wzór: Korpus' })).toBeVisible();
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

test('build a 3-chart project from scratch, knit it, export it and open it again', async ({
  page,
}, testInfo) => {
  test.slow();
  const csp = await watchCsp(page);
  await startFromScratch(page);

  // Project: name and sizes.
  await page.getByRole('link', { name: 'Mój projekt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mój projekt' })).toBeVisible();
  await page.getByLabel('Nazwa projektu').fill('Sweter od zera');
  await page.getByRole('textbox', { name: 'Rozmiar 1' }).fill('S');
  await page.getByRole('button', { name: 'Dodaj rozmiar' }).click();
  await page.getByRole('textbox', { name: 'Rozmiar 2' }).fill('M');
  await page.getByTestId('pattern-list').getByRole('link', { name: 'Edytuj' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wzór: Korpus' })).toBeVisible();

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
  const add = page.getByLabel('Dodaj schemat do układu');
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
  await page.getByLabel('Znam liczbę rzędów wzoru').check();
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
  // The pattern is valid: back to the project, export it.
  await expect(page.getByRole('button', { name: 'Dziergaj ten wzór' })).toBeEnabled();
  await page.getByRole('link', { name: 'Wróć do projektu' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sweter od zera' })).toBeVisible();
  // Only notes (texture changes), no errors or warnings.
  await expect(page.getByText('4 uwagi', { exact: true })).toBeVisible();
  await expect(page.locator('.notice--danger')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zapisz projekt do pliku' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path()) ?? '', 'utf8')) as {
    format: string;
    schemaVersion: number;
    project: {
      sizes: string[];
      patterns: {
        expectedStitches: number[];
        rows: number;
        charts: { id: string; name: string; palette: Record<string, string>; rows: string[] }[];
      }[];
    };
  };
  expect(exported).toMatchObject({ format: 'knitting-tracker/project', schemaVersion: 3 });
  expect(exported.project.sizes).toEqual(['S', 'M']);
  expect(exported.project.patterns[0]).toMatchObject({ expectedStitches: [28, 32], rows: 12 });
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
  const byName = Object.fromEntries(
    (exported.project.patterns[0]?.charts ?? []).map((c) => [c.id, asChars(c)]),
  );
  expect(byName).toEqual(EXPECTED_ROWS);

  // Knit it (size M).
  await page.getByLabel('Dziergasz rozmiar').selectOption({ label: 'M' });
  await page.getByTestId('continue-knitting').click();
  await expect(page).toHaveURL(/\/projekt\/[^/]+\/wzor\/pattern-1$/);
  await expect(page.getByTestId('grid')).toBeVisible();
  await page.getByRole('button', { name: /Ukończ okrążenie/ }).click();
  await expect(page.getByTestId('status-detail')).toContainText('okrążenie 1, oczko 32');

  // Open the exported file as a new project.
  await page.goto('/nowy');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sweter.ktproject.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole('heading', { level: 2, name: 'Sweter od zera' })).toBeVisible();
  await page.getByLabel('Rozmiar').selectOption({ label: 'S' });
  await page.getByLabel('Nazwa projektu').fill('Drugi sweter');
  await page.getByRole('button', { name: 'Utwórz projekt' }).click();
  await expect(page.getByTestId('grid')).toBeVisible();
  await expect(page.getByText('/ 28')).toBeVisible();

  await page.goto('/');
  await expect(page.locator('.project-list > li')).toHaveCount(2);
  expect(await csp()).toEqual([]);
});

test('touch: a tap paints one cell and undo restores it', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch devices only');
  await startFromScratch(page);
  await addChart(page, 'Dotyk', 4, 3);
  await page.getByRole('button', { name: /^lewe/ }).first().click();
  const p = await cellPoint(page, 2, 3);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByText('Rząd 2, oczko 2 (licząc od prawej): lewe')).toBeVisible();
  await page.getByRole('button', { name: 'Cofnij (Ctrl+Z)' }).click();
  await expect(page.getByText('Rząd 2, oczko 2 (licząc od prawej): prawe')).toBeVisible();
});
