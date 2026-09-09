import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  },
  renderer: {
    plugins: [react()],
    // @hiltwright/core is linked from the workspace and shipped as TypeScript source; bundle it.
    optimizeDeps: { exclude: ['@hiltwright/core'] },
  },
});
