// Takes the site's screenshots from the app's own guided tour, and writes the tour's words beside them.
//
//   npm run capture            (in site/; needs the workspace installed at the repo root: npm ci)
//
// Writes site/assets/shots/tour-NN.png (each tour step, with its card), clean-NN.png (the same page with the tour
// hidden, for the steps listed in CLEAN), site/assets/themes/<theme>.jpg and site/data/themes.json (the Armory in
// every theme, and the themes' names) and site/data/tour.json (chapters, titles and text, from tourSteps.ts).
//
// It runs the app in development mode with the main process's development aids, as apps/desktop/scripts/shots.mjs
// does. It never reaches a board or a real card: HILTWRIGHT_NO_BOARD is always set (the script stops if it cannot
// be), and the app's data folder, font library and card are made-up folders under the OS temp folder.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const root = resolve(site, '..');
const desktop = join(root, 'apps/desktop');
const outDir = join(site, 'assets/shots');
const W = 1480, H = 980;

// Steps (counted from 1) that are also photographed without the tour over them.
const CLEAN = [7, 11, 14, 19, 20, 22, 24, 28, 29, 31, 34, 36, 39, 40, 41, 42, 44, 46];
// The step photographed once in every theme: the Armory, with the example saber.
const THEME_STEP = 7;
// Steps photographed for the promo pages' feature rows, and the theme each is taken in.
const FEATURE = { 7: 'kashyyyk', 11: 'hull', 14: 'coruscant', 22: 'ronin', 24: 'naboo', 28: 'original', 29: 'ninth', 31: 'hoth', 34: 'station', 36: 'crait', 39: 'naboo', 41: 'crait' };

// The tour's words: tourSteps.ts only imports a type, so Node can load it with its types stripped.
const { TOUR } = await import(pathToFileURL(join(desktop, 'src/renderer/src/tourSteps.ts')).href);
const pad = (n) => String(n).padStart(2, '0');
let n = 0;
const chapters = TOUR.map((c) => ({ id: c.id, name: c.name, page: c.page, steps: c.steps.map((s) => ({ n: ++n, title: s.title, text: s.text, shot: `tour-${pad(n)}.png` })) }));
const COUNT = n;
mkdirSync(join(site, 'data'), { recursive: true });
writeFileSync(join(site, 'data/tour.json'), JSON.stringify({ chapters, clean: CLEAN }, null, 2) + '\n');
console.log(`tour.json: ${chapters.length} chapters, ${COUNT} steps`);
if (process.argv.includes('--words')) process.exit(0);

// Fixtures: a font library and a card with made-up fonts, and an empty data folder.
function wav(seconds = 0.1) {
  const data = Buffer.alloc(Math.round(44100 * 2 * seconds));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const SOUNDS = ['hum01', 'hum02', 'out01', 'out02', 'in01', 'in02', 'clsh01', 'clsh02', 'clsh03', 'blst01', 'blst02', 'swng01', 'swng02', 'swng03', 'swng04', 'lock01', 'boot01', 'font01', 'force01', 'stab01', 'swingh01', 'swingl01', 'drag01', 'melt01'];
function makeFont(dir, name) {
  const d = join(dir, name);
  mkdirSync(d, { recursive: true });
  for (const s of SOUNDS) writeFileSync(join(d, `${s}.wav`), wav(s.startsWith('hum') ? 0.4 : 0.1));
  writeFileSync(join(d, 'config.ini'), 'humstart=300\n');
}
const base = mkdtempSync(join(tmpdir(), 'hiltwright-site-'));
const userData = join(base, 'userData'), fontLibrary = join(base, 'fontlibrary'), card = join(base, 'card');
for (const d of [userData, fontLibrary, card]) mkdirSync(d, { recursive: true });
const fonts = ['Ember_Vault', 'Glacier_Hum', 'Iron_Monk', 'Night_Orchard', 'Signal_Fire', 'Tidewalker', 'Old_Republic_Radio', 'Quiet_Storm', 'Brass_Lantern', 'Violet_Hour'];
const makers = ['Kyberphonic', 'Greyscale Audio', 'Shadowfoil', '', 'Kyberphonic', 'Greyscale Audio', '', 'Shadowfoil', '', 'Kyberphonic'];
const index = { version: 1, fonts: {}, makers: {} };
fonts.forEach((f, i) => {
  makeFont(fontLibrary, f);
  index.fonts[f] = { name: f.replace(/_/g, ' '), maker: makers[i], notes: i % 4 === 0 ? 'Swings are quiet; turn the volume up a notch.' : '', added: `2026-10-0${1 + (i % 9)}T10:00:00.000Z` };
});
writeFileSync(join(fontLibrary, 'hiltwright-fonts.json'), JSON.stringify(index));
fonts.slice(0, 7).forEach((f) => makeFont(card, f));
mkdirSync(join(card, 'tracks'), { recursive: true });
for (const t of ['duel.wav', 'march.wav', 'sunset.wav']) writeFileSync(join(card, 'tracks', t), wav(1));
writeFileSync(join(card, 'presets.ini'), '');

const env = { ...process.env, HILTWRIGHT_NO_BOARD: '1', HILTWRIGHT_OFFSCREEN: '1', HILTWRIGHT_USER_DATA: userData, HILTWRIGHT_FONT_LIBRARY: fontLibrary, HILTWRIGHT_SD_ROOT: card, HILTWRIGHT_W: String(W), HILTWRIGHT_H: String(H), HILTWRIGHT_PAGE: 'armory' };
delete env.ELECTRON_RUN_AS_NODE;
if (env.HILTWRIGHT_NO_BOARD !== '1') { console.error('Could not set HILTWRIGHT_NO_BOARD. Not starting the app.'); process.exit(1); }

const HIDE = "(() => { if (!document.getElementById('site-hide')) { const s = document.createElement('style'); s.id = 'site-hide'; s.textContent = '.site-clean .tour{visibility:hidden!important}'; document.head.appendChild(s); } })();";
// No picture may show this computer's folders (they carry the account's name): wherever the made-up data folder's
// path is on the page, it is shown as a neutral one. Every step waits, then cleans, then is photographed.
const NEUTRAL = 'D:\\Sabers';
// The made-up card is a plain folder, so the app marks it as a developer's stand-in and cannot read its size or
// format. In the pictures it reads as the example card it stands for.
const EXAMPLE_CARD = [[' (dev override)', ''], ['— free of —', '14.2 GB free of 29.7 GB'], ['format not reported', 'FAT32']];
const SCRUB = `(() => { const swap = (s) => { let out = s; for (const from of ${JSON.stringify([base, base.replace(/\\/g, '/')])}) out = out.split(from).join(${JSON.stringify(NEUTRAL)}); for (const [a, b] of ${JSON.stringify(EXAMPLE_CARD)}) out = out.split(a).join(b); return out; }; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { const t = swap(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; } for (const el of document.querySelectorAll('input,[title]')) { if (el.value && swap(el.value) !== el.value) el.value = swap(el.value); if (el.title && swap(el.title) !== el.title) el.title = swap(el.title); } })();`;
const step = (statements, wait = 450) => `(async () => { ${statements}; await new Promise((r) => setTimeout(r, ${wait})); ${SCRUB} })()`;
const shots = [];
for (let k = 1; k <= COUNT; k++) {
  shots.push({ file: join(outDir, `tour-${pad(k)}.png`), js: step(`${HIDE} document.documentElement.classList.remove('site-clean'); window.hiltwrightTour(${k - 1})`) });
  if (CLEAN.includes(k)) shots.push({ file: join(outDir, `clean-${pad(k)}.png`), js: step("document.documentElement.classList.add('site-clean')", 300) });
}
// The same Armory in every theme, for the theme stage on the home page: site/assets/themes/<id>.jpg. The walkthrough
// above is taken in the default theme; the app is put back to it afterwards.
const { THEMES, DEFAULT_THEME } = await import(pathToFileURL(join(desktop, 'src/shared/themes.ts')).href);
const themeDir = join(site, 'assets/themes');
for (const t of THEMES) {
  shots.push({ file: join(themeDir, `${t.id}.jpg`), js: step(`${HIDE} document.documentElement.classList.add('site-clean'); window.hiltwrightTheme(${JSON.stringify(t.id)}); window.hiltwrightTour(${THEME_STEP - 1})`, 900) });
}
// The pictures beside the promo pages' feature rows: each page of the app in a different theme, so the site shows
// all of them. site/assets/feature/<step>.jpg, and which theme each is in.
const featureDir = join(site, 'assets/feature');
for (const [n, theme] of Object.entries(FEATURE)) {
  if (!THEMES.some((t) => t.id === theme)) { console.error(`FEATURE: no theme "${theme}"`); process.exit(1); }
  shots.push({ file: join(featureDir, `${pad(Number(n))}.jpg`), js: step(`${HIDE} document.documentElement.classList.add('site-clean'); window.hiltwrightTheme(${JSON.stringify(theme)}); window.hiltwrightTour(${Number(n) - 1})`, 900) });
}
mkdirSync(featureDir, { recursive: true });
writeFileSync(join(site, 'data/feature.json'), JSON.stringify(Object.fromEntries(Object.entries(FEATURE).map(([n, id]) => [pad(Number(n)), { id, name: THEMES.find((t) => t.id === id).name }])), null, 2) + '\n');
shots.push({ file: join(base, 'reset.png'), js: `window.hiltwrightTheme(${JSON.stringify(DEFAULT_THEME)})` });
writeFileSync(join(site, 'data/themes.json'), JSON.stringify(THEMES.map((t) => ({ id: t.id, name: t.name, about: t.about, accent: t.swatch[2] })), null, 2) + '\n');
env.HILTWRIGHT_SHOTS = JSON.stringify(shots);
mkdirSync(outDir, { recursive: true });
mkdirSync(themeDir, { recursive: true });

const child = spawn(process.execPath, [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev'], { cwd: desktop, env });
let log = ''; let finished = false;
const finish = (ok) => {
  if (finished) return; finished = true;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL');
  rmSync(base, { recursive: true, force: true });
  const taken = (log.match(/\[main\] screenshot /g) ?? []).length;
  console.log(ok ? `${taken} screenshots in ${outDir}` : `FAILED after ${taken} screenshots\n${log.split('\n').slice(-15).join('\n')}`);
  for (const l of log.split('\n')) if (/screenshot script failed|\[tour\] (refused|not )/.test(l)) console.log('  ' + l.trim());
  setTimeout(() => process.exit(ok ? 0 : 1), 1200);
};
const onData = (d) => { log += d; if (log.includes('[main] screenshots done')) finish(true); };
child.stdout.on('data', onData); child.stderr.on('data', onData);
child.on('exit', () => finish(log.includes('[main] screenshots done')));
setTimeout(() => finish(false), 600000);
