import { defineConfig } from 'vitest/config';

// Own config so vitest never inherits a vite.config.ts from a parent directory (the desktop app will have one).
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
