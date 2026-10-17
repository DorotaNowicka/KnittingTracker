import { defineConfig } from 'vitest/config';

// Workspace-wide test runner. Each package/app has its own `vitest.config.ts` (project).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', 'apps/web/src/main.tsx', 'apps/web/src/sw.ts'],
      thresholds: {
        // NFR-2: the domain core must stay at >= 90 %.
        'packages/core/src/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
