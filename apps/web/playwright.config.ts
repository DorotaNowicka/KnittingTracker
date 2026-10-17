import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * Viewport matrix (Q3 answer): iPhone (WebKit), Android phone (Chromium), tablet, desktop.
 *
 * Local environments without WebKit: set PW_NO_WEBKIT=1 to run the iPhone project in Chromium
 * with the iPhone viewport (reported as "unverified on WebKit"). PW_CHROMIUM_PATH points Playwright
 * at a preinstalled Chromium binary instead of downloading one.
 */
const noWebkit = process.env.PW_NO_WEBKIT === '1';
const chromiumPath = process.env.PW_CHROMIUM_PATH;
// E2E_BASE_URL runs the suite against an already running server (e.g. the nginx container,
// to verify CSP and caching headers) instead of `vite preview`.
const externalBaseUrl = process.env.E2E_BASE_URL;
const chromiumLaunch = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

const projects: Project[] = [
  {
    name: 'phone-ios',
    use: noWebkit
      ? { ...devices['iPhone 15'], browserName: 'chromium', ...chromiumLaunch }
      : { ...devices['iPhone 15'] },
  },
  { name: 'phone-android', use: { ...devices['Pixel 7'], ...chromiumLaunch } },
  {
    name: 'tablet',
    use: {
      browserName: 'chromium',
      viewport: { width: 820, height: 1180 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      ...chromiumLaunch,
    },
  },
  {
    name: 'desktop',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      ...chromiumLaunch,
    },
  },
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    locale: 'pl-PL',
  },
  projects,
  // e2e runs against the production build (service worker included). Build first: `pnpm build`.
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: 'pnpm run preview',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});
