// The workshop on the website: the app's own Styles page and style editor (apps/desktop/src/renderer/web), bundled for
// the browser into dist/workshop/. The packages it needs (React, pixi.js, the app's typefaces) come from the repo's own
// install at the root, so the website runs the same versions the app ships; @hiltwright/core is bundled from source.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// The app's own pack reader (TypeScript, which Node 24 runs as it is).
import { decodeMesh, readItem, readManifest } from '../apps/desktop/src/main/hwpack.ts';

/**
 * The demo room's built-in hilt, Punk Saber (CC BY 4.0, by safwyls), unpacked from the app's pack into plain files:
 * `<id>.json` (the pack's name, credit, licence, fit, and the mesh's sizes and groups) and `<id>.bin` (positions,
 * normals, then indices). The pack itself, and its key, never reach the page.
 */
function writeBuiltInHilt(repo, out) {
  const file = readFileSync(join(repo, 'apps/desktop/resources/builtin/punk-saber.hwpack'));
  const { manifest, itemsStart } = readManifest(file);
  if (manifest.kind !== 'hilt' || !/^CC BY/.test(manifest.licence)) throw new Error(`the built-in hilt pack is not a hilt with an open licence (${manifest.licence})`);
  const item = manifest.items.find((i) => i.kind === 'mesh');
  if (!item) throw new Error('the built-in hilt pack has no mesh');
  const mesh = decodeMesh(readItem(file, manifest, itemsStart, item));
  const { items: _items, ...info } = manifest;
  const parts = [mesh.positions, mesh.normals, mesh.indices].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  writeFileSync(join(out, `${manifest.id}.bin`), Buffer.concat(parts));
  writeFileSync(join(out, `${manifest.id}.json`), JSON.stringify({ ...info, positions: mesh.positions.length, normals: mesh.normals.length, indices: mesh.indices.length, groups: mesh.groups }));
}

/** What the page may load and run: its own files only, as the app's page. Pixi's no-eval build keeps eval out. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob:";

export async function buildWorkshop({ repo, dist, layoutHead = '' }) {
  const out = join(dist, 'workshop');
  mkdirSync(join(out, 'hilts'), { recursive: true });
  writeBuiltInHilt(repo, join(out, 'hilts'));
  await build({
    entryPoints: { workshop: join(repo, 'apps/desktop/src/renderer/web/main.tsx') },
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    outdir: out,
    // The demo room (three.js) is its own chunk, fetched when the room opens.
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
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
