import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'importer',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Image recognition is CPU-heavy; on shared CI runners with coverage it is several times
    // slower than on a laptop. Tests that need more set their own timeout.
    testTimeout: 20_000,
  },
});
