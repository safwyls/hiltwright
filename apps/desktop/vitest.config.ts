import { defineConfig } from 'vitest/config';

// Main-process services are Electron-free, so they get plain Node tests. The build test needs a real toolchain and
// is skipped unless HILTWRIGHT_TOOLCHAIN_DIR points at one (the spike cache works).
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10 * 60 * 1000,
  },
});
