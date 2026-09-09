import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // @hiltwright/core ships as TypeScript source from the workspace, so it must be bundled everywhere, not externalised.
  main: { plugins: [externalizeDepsPlugin({ exclude: ['@hiltwright/core'] })] },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@hiltwright/core'] })],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  },
  renderer: {
    plugins: [react()],
    // @hiltwright/core is linked from the workspace and shipped as TypeScript source; bundle it.
    optimizeDeps: { exclude: ['@hiltwright/core'] },
  },
});
