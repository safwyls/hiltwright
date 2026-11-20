import { readFileSync } from 'node:fs';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// The app's version is the package's, fixed at build time (the sandboxed preload cannot ask Electron for it).
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

// What the app's Electron carries (45: Node.js 24, Chromium 156). electron-vite 4 only knows Electron up to 38 and
// would build for that one's older Node.js and Chromium, so the targets are named here. Change them with Electron.
const NODE_TARGET = 'node24';
const CHROME_TARGET = 'chrome156';

export default defineConfig({
  // @hiltwright/core ships as TypeScript source from the workspace, so it must be bundled everywhere, not externalised.
  main: { plugins: [externalizeDepsPlugin({ exclude: ['@hiltwright/core'] })], build: { target: NODE_TARGET } },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@hiltwright/core'] })],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: { target: NODE_TARGET, rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  },
  renderer: {
    build: { target: CHROME_TARGET },
    // Live reload needs ws:/wss: in the page's CSP during development only; a production page must not open them.
    plugins: [react(), { name: 'csp-without-live-reload', apply: 'build', transformIndexHtml: (html: string) => html.replace(' ws: wss:', '') }],
    // @hiltwright/core is linked from the workspace and shipped as TypeScript source; bundle it.
    optimizeDeps: { exclude: ['@hiltwright/core'] },
  },
});
