import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'grid-renderer',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
