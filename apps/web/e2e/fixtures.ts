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

/**
 * A pattern file of schema v1 or v2 (one pattern with stages). Kept on purpose: opening it in
 * the app converts it to a project whose patterns are the former stages (schema v3).
 */
export function patternFile(
  pattern: object,
  schemaVersion = 1,
): { name: string; mimeType: string; buffer: Buffer } {
  const text = JSON.stringify({
    format: 'knitting-tracker/pattern',
    schemaVersion,
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

/**
 * Round body (4 rounds) → flat front that continues the body's rope (open-ended, "until 10 cm")
 * → ribbing tracked with a row counter. Schema v2 features of M5.
 */
export const stagesPattern = {
  id: 'e2e-stages',
  revision: 1,
  title: 'Kamizelka etapowa',
  sizes: ['one'],
  gauge: { stitches: 22, rows: 30 },
  symbols: [],
  legend: [],
  charts,
  stages: [
    {
      id: 'body',
      name: 'Korpus',
      construction: 'round',
      firstRowSide: 'RS',
      rows: 4,
      layout: [
        { kind: 'marker', id: 'a', sectionName: 'Przód' },
        { kind: 'chart', placementId: 'r1', chartId: 'rope' },
        { kind: 'chart', placementId: 's1', chartId: 'seed', stitches: 4 },
        { kind: 'marker', id: 'b', sectionName: 'Tył' },
        { kind: 'chart', placementId: 'r2', chartId: 'rope' },
        { kind: 'chart', placementId: 's2', chartId: 'seed', stitches: 4 },
      ],
    },
    {
      id: 'front',
      name: 'Przód',
      construction: 'flat',
      // RS first: the rope's cable row (chart row 1) then falls on front row 3, a right-side row.
      firstRowSide: 'RS',
      targetCm: 10,
      layout: [
        {
          kind: 'chart',
          placementId: 'fr',
          chartId: 'rope',
          continueFrom: { stageId: 'body', placementId: 'r1' },
        },
        { kind: 'chart', placementId: 'fs', chartId: 'seed', stitches: 4 },
      ],
    },
    {
      id: 'rib',
      name: 'Ściągacz',
      construction: 'round',
      firstRowSide: 'RS',
      tracking: 'rows',
      rows: 6,
      layout: [{ kind: 'marker', id: 'start' }],
    },
  ],
};

/** Import a pattern file through the UI and create a project from it. */
export async function createProjectFromFile(
  page: Page,
  pattern: object,
  name = 'Projekt testowy',
  schemaVersion = 1,
  /** Origin of another server than the configured base URL (e.g. the update test's own). */
  base = '',
) {
  await page.goto(`${base}/nowy`);
  await page.locator('input[type="file"]').setInputFiles(patternFile(pattern, schemaVersion));
  await page.getByLabel('Nazwa projektu').fill(name);
  await page.getByRole('button', { name: 'Utwórz projekt' }).click();
  await expect(page).toHaveURL(/\/projekt\/[^/]+\/wzor\//);
  await expect(page.getByTestId('grid')).toBeVisible();
}

/** Id of the project the page shows (from a /projekt/<id>/… address). */
export function projectIdOf(page: Page): string {
  const id = /\/projekt\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`not a project page: ${page.url()}`);
  return decodeURIComponent(id);
}

/** From the project list: open a project and continue knitting its active pattern. */
export async function continueKnitting(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByTestId('continue-knitting').click();
  await expect(page.getByTestId('grid').or(page.getByTestId('row-counter'))).toBeVisible();
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

/**
 * Collect Content-Security-Policy violations (preview and nginx send the production CSP).
 *
 * Each entry names the directive, what was blocked, where (script source and line) and the
 * element it was reported on, so a failure in CI says what to fix.
 *
 * One known engine quirk is left out: WebKit reports `style-src-attr` for the internal inline
 * styles of its own `<select>` controls (user-agent shadow DOM). Those styles are not ours, are
 * not blocked in a way that affects the app, and Chromium does not report them. Everything else,
 * including style-src-attr on any other element, still fails the test.
 */
export async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations?: string[] };
    w.__cspViolations = [];
    document.addEventListener(
      'securitypolicyviolation',
      (e) => {
        const target = e.target instanceof Element ? e.target : null;
        const tag = target?.tagName.toLowerCase() ?? (e.target === document ? 'document' : '?');
        if (e.violatedDirective === 'style-src-attr' && target?.closest('select')) return;
        const where = e.sourceFile ? ` at ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}` : '';
        const cls = target && typeof target.className === 'string' ? `.${target.className}` : '';
        w.__cspViolations?.push(
          `${e.violatedDirective} ${e.blockedURI}${where} on <${tag}${cls}>${e.sample ? ` "${e.sample}"` : ''}`,
        );
      },
      true,
    );
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
}
