import { expect, type Page } from '@playwright/test';

/** Synthetic patterns written for tests (never third-party material). */
const charts = [
  {
    id: 'seed',
    name: 'Ryż',
    width: 2,
    height: 2,
    palette: { k: 'std:k', p: 'std:p' },
    rows: ['kp', 'pk'],
  },
  {
    id: 'rope',
    name: 'Warkocz',
    width: 6,
    height: 6,
    palette: { k: 'std:k', p: 'std:p', C: 'cable:2-2-lc' },
    rows: ['pC...p', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp', 'pkkkkp'],
  },
];

export function patternFile(pattern: object): { name: string; mimeType: string; buffer: Buffer } {
  const text = JSON.stringify({
    format: 'knitting-tracker/pattern',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    pattern,
  });
  return {
    name: 'wzor-testowy.ktpattern.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  };
}

/** 2 sizes; round body of 2 × 13 stitches (size M) and a flat back that starts on the wrong side. */
export const testPattern = {
  id: 'e2e-sweater',
  revision: 1,
  title: 'Sweter testowy',
  sizes: ['S', 'M'],
  symbols: [],
  legend: [{ symbolId: 'cable:2-2-lc', text: 'Warkocz testowy' }],
  charts,
  stages: [
    {
      id: 'body',
      name: 'Korpus',
      construction: 'round',
      firstRowSide: 'RS',
      rows: 12,
      expectedStitches: [22, 26],
      layout: [
        { kind: 'marker', id: 'a', sectionName: 'Przód' },
        { kind: 'chart', placementId: 's1', chartId: 'seed', stitches: [5, 7] },
        { kind: 'chart', placementId: 'r1', chartId: 'rope' },
        { kind: 'marker', id: 'b', sectionName: 'Tył' },
        { kind: 'chart', placementId: 's2', chartId: 'seed', stitches: [5, 7] },
        { kind: 'chart', placementId: 'r2', chartId: 'rope' },
      ],
    },
    {
      id: 'back',
      name: 'Tył płasko',
      construction: 'flat',
      firstRowSide: 'WS',
      layout: [
        { kind: 'chart', placementId: 's', chartId: 'seed', stitches: 4 },
        { kind: 'chart', placementId: 'r', chartId: 'rope', rowOffset: 1 },
      ],
    },
  ],
};

/** 500 stitches × 300 rows of cables and seed stitch (performance budget, NFR-3). */
export const bigPattern = {
  ...testPattern,
  id: 'e2e-big',
  title: 'Duża siatka',
  sizes: ['one'],
  stages: [
    {
      id: 'big',
      name: 'Duży korpus',
      construction: 'round',
      firstRowSide: 'RS',
      rows: 300,
      expectedStitches: 500,
      layout: Array.from({ length: 50 }, (_, i) => [
        { kind: 'chart', placementId: `r${i}`, chartId: 'rope' },
        { kind: 'chart', placementId: `s${i}`, chartId: 'seed', stitches: 4 },
      ]).flat(),
    },
  ],
};

/** Import a pattern file through the UI and create a project from it. */
export async function createProjectFromFile(page: Page, pattern: object, name = 'Projekt testowy') {
  await page.goto('/nowy');
  await page.locator('input[type="file"]').setInputFiles(patternFile(pattern));
  await page.getByLabel('Nazwa projektu').fill(name);
  await page.getByRole('button', { name: 'Utwórz projekt' }).click();
  await expect(page).toHaveURL(/\/projekt\//);
  await expect(page.getByTestId('grid')).toBeVisible();
}

/** Tap the centre of a grid cell (row, display column) after scrolling it into view. */
export async function tapCell(page: Page, row: number, col: number) {
  const point = await page.evaluate(
    ([r, c]) => {
      const hook = (
        window as unknown as {
          __ktGrid?: {
            renderer: { reveal(r: number, c: number, m: string): void; draw(): void };
            pointOf(r: number, c: number): { x: number; y: number } | null;
          };
        }
      ).__ktGrid;
      if (!hook) return null;
      hook.renderer.reveal(r, c, 'center');
      hook.renderer.draw();
      return hook.pointOf(r, c);
    },
    [row, col] as const,
  );
  if (!point) throw new Error('grid test hook missing (is this a prod build?)');
  await page.mouse.click(point.x, point.y);
}

/** Collect Content-Security-Policy violations (preview and nginx send the production CSP). */
export async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations?: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations?.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
}
