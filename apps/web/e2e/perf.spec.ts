import { expect, test } from '@playwright/test';
import { bigPattern, createProjectFromFile } from './fixtures';

/**
 * NFR-3 / ADR-6: 500 stitches × 300 rows must pan smoothly. Measures the renderer's own frame cost
 * (scene build + paint) while panning, with the CPU throttled 4× to stand in for a mid-range tablet.
 */
test('500 × 300 grid pans within the frame budget', async ({ page, browserName }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop' && testInfo.project.name !== 'tablet',
    'measured on tablet and desktop',
  );
  test.setTimeout(120_000);
  await createProjectFromFile(page, bigPattern, 'Duży projekt');
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const grid = page.getByTestId('grid');
  const box = await grid.boundingBox();
  if (!box) throw new Error('no grid');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Warm-up: the first cache move allocates the second bitmap once; measure steady-state panning.
  for (let i = 0; i < 16; i++) await page.mouse.wheel(i < 8 ? 80 : -80, 40);
  await page.evaluate(() => {
    (
      window as unknown as { __ktGrid: { renderer: { stats: { recent: number[] } } } }
    ).__ktGrid.renderer.stats.recent.length = 0;
  });
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(i % 20 < 10 ? 37 : -37, i % 2 ? 23 : -11);
    await page.waitForTimeout(16);
  }
  const frames = await page.evaluate(
    () =>
      (window as unknown as { __ktGrid: { renderer: { stats: { recent: number[] } } } }).__ktGrid
        .renderer.stats.recent,
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  testInfo.annotations.push({
    type: 'perf',
    description: `frames=${frames.length} avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms`,
  });
  console.log(
    `[perf] ${testInfo.project.name}: frames=${frames.length} avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`,
  );
  expect(frames.length).toBeGreaterThan(20);
  expect(p95).toBeLessThan(16);
});
