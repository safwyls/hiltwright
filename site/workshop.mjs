// The workshop on the website: the app's own Styles page and style editor (apps/desktop/src/renderer/web), bundled for
// the browser into dist/workshop/. The packages it needs (React, pixi.js, the app's typefaces) come from the repo's own
// install at the root, so the website runs the same versions the app ships; @hiltwright/core is bundled from source.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the page may load and run: its own files only, as the app's page. Pixi's no-eval build keeps eval out. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob:";

export async function buildWorkshop({ repo, dist, layoutHead = '' }) {
  const out = join(dist, 'workshop');
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: { workshop: join(repo, 'apps/desktop/src/renderer/web/main.tsx') },
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    outdir: out,
    assetNames: 'assets/[name]-[hash]',
    loader: { '.woff2': 'file', '.woff': 'file', '.svg': 'file', '.jpg': 'file', '.webp': 'file', '.png': 'file' },
    jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"production"' },
    // The repo root's node_modules, wherever esbuild itself is installed.
    nodePaths: [join(repo, 'node_modules')],
    logLevel: 'warning',
  });
  writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="color-scheme" content="dark" />
    <title>Workshop · Hiltwright</title>
    <meta name="description" content="Try Hiltwright's blade styles and build your own in the browser, then take them into the Hiltwright app." />
    ${layoutHead}
    <link rel="stylesheet" href="workshop.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="workshop.js"></script>
  </body>
</html>
`);
}
