import { defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineProject({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // Theme tests read the token file as text (`?raw`); other CSS stays unprocessed.
    css: { include: [/tokens\.css/] },
  },
});
