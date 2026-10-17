import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createProjectFromFile, stagesPattern } from './fixtures';
import { syntheticPng } from './synthetic';

// Accessibility audit (M6, WCAG 2.2 AA): every screen and dialog in both themes, reflow at 320 CSS
// px, keyboard-only use of the tracker, and reduced motion. The canvas grids are excluded from axe
// (they are images to assistive technology; the current row as text is their accessible view).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axe(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).exclude('canvas').analyze();
  const found = results.violations.map(
    (v) => `${where}: ${v.id} (${v.impact ?? ''}) ${v.nodes[0]?.target.join(' ') ?? ''}`,
  );
  return found;
}

/** Pages that are not the grid: none of them may scroll sideways at 320 px. */
const PAGES = [
  '/',
  '/nowy',
  '/wzory',
  '/ustawienia',
  '/import',
  '/wzor/e2e-stages',
  '/wzor/e2e-stages/etap/front',
  '/wzor/e2e-stages/nowy-projekt',
];

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: every screen and dialog (${scheme})`, async ({ page }, testInfo) => {
    test.skip(
      !['desktop', 'phone-android'].includes(testInfo.project.name),
      'two viewports are enough for the audit sweep',
    );
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    const problems: string[] = [];

    await page.goto('/');
    problems.push(...(await axe(page, 'empty projects')));

    await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
    problems.push(...(await axe(page, 'tracker')));
    const toggle = page.getByRole('button', { name: 'Pokaż panel' });
    if (await toggle.isVisible()) await toggle.click();
    problems.push(...(await axe(page, 'tracker panel')));
    for (const [open, name] of [
      ['Ustaw pozycję', 'position dialog'],
      ['Zakończ etap', 'finish dialog'],
      ['Projekt', 'project dialog'],
    ] as const) {
      await page.getByRole('button', { name: open, exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      problems.push(...(await axe(page, name)));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.getByRole('combobox', { name: 'Etap' }).selectOption('rib');
    await expect(page.getByTestId('row-counter')).toBeVisible();
    problems.push(...(await axe(page, 'row counter')));

    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      problems.push(...(await axe(page, path)));
    }
    await page.goto('/wzor/e2e-stages/schemat/rope');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    problems.push(...(await axe(page, 'chart editor')));

    expect(problems).toEqual([]);
  });
}

test('reflow: no sideways scrolling at 320 CSS px (WCAG 1.4.10)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-android', 'one narrow viewport');
  await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
  await page.setViewportSize({ width: 320, height: 640 });
  const wide: string[] = [];
  for (const path of [...PAGES, '/wzor/e2e-stages/schemat/rope', '/projekt/x']) {
    if (path === '/projekt/x') {
      await page.goto('/');
      await page
        .getByRole('link', { name: /Kamizelka/ })
        .first()
        .click();
      await expect(page.getByTestId('grid')).toBeVisible();
    } else {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) wide.push(`${path}: ${overflow}px`);
  }
  expect(wide).toEqual([]);
});

test('keyboard only: open a project, mark stitches, set the position', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard flow on desktop');
  await createProjectFromFile(page, stagesPattern, 'Kamizelka', 2);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Kamizelka/ })).toBeVisible();
  // Tab to the project link and open it.
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (name.includes('Kamizelka')) break;
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('grid')).toBeVisible();

  // Focus the grid with Tab, move the cursor with arrows and mark with Enter.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await page.getByTestId('grid').evaluate((el) => el === document.activeElement)) break;
  }
  await expect(page.getByTestId('grid')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // shows the cursor at the next stitch
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status-detail')).toContainText('razem');

  // G opens the position dialog with focus inside; Escape returns focus to the page.
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Gdzie jesteś?' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Every focusable control shows a visible focus indicator.
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return 'none';
    const s = getComputedStyle(el);
    return s.outlineStyle === 'none' && s.boxShadow === 'none' ? 'none' : 'visible';
  });
  expect(outline).toBe('visible');
});

test('reduced motion turns animations off', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.btn, a, button')]
      .slice(0, 20)
      .map((el) => getComputedStyle(el).transitionDuration),
  );
  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) {
    expect(
      d.split(',').every((x) => parseFloat(x) <= 0.01),
      `transition ${d}`,
    ).toBe(true);
  }
});

test('photo corners can be placed with single taps instead of dragging (WCAG 2.5.7)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-android', 'one touch viewport');
  await page.goto('/import');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'zdjecie.png',
    mimeType: 'image/png',
    buffer: syntheticPng(true).buffer,
  });
  const handle = page.getByRole('button', { name: /lewy górny/i });
  await expect(handle).toBeVisible();
  const before = await handle.boundingBox();
  const box = await page.locator('.straighten__image').boundingBox();
  if (!before || !box) throw new Error('no layout');
  // Tap a point inside the picture, near the top-left corner but clearly off the handle.
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.25);
  const after = await handle.boundingBox();
  expect(after && Math.round(after.x + after.width / 2)).toBe(Math.round(box.x + box.width * 0.2));
});
