// Offscreen screenshots of every page at the default and the minimum window size, for checking layouts (layout-fit).
//
//   npm run shots -w @hiltwright/desktop -- <folder> [page ...]
//
// Writes <folder>/<page>-<width>x<height>.png. The guided tour: `tour` takes every step in one run per window size
// (tour-01-<size>.png and on), `tour-<n>` one step, `tour-offer` the first-launch offer, and `tour-entry-side` and
// `tour-entry-top` the two places it starts from. Each tour step's placement is printed from the run log. It uses the development aids of the main process (HILTWRIGHT_OFFSCREEN,
// HILTWRIGHT_W, HILTWRIGHT_H, HILTWRIGHT_SHOT, HILTWRIGHT_PAGE=fake:<page>), so it runs the app in development mode.
//
// It never reaches a board or a real card: HILTWRIGHT_NO_BOARD is always set (and the script stops if it cannot be),
// the app's data folder, font library and card are all fixture folders made under the OS temp folder, and nothing
// of the owner's is read.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');

const SIZES = [{ w: 1480, h: 980 }, { w: 1180, h: 700 }];

const outDir = process.argv[2];
if (!outDir) { console.error('Usage: npm run shots -w @hiltwright/desktop -- <folder> [page ...]'); process.exit(2); }

// The pages, read from the app's own list so a new page is photographed without touching this script.
const appSource = readFileSync(join(desktop, 'src/renderer/src/App.tsx'), 'utf8');
const typeLine = /^type Page = ([^;]+);/m.exec(appSource);
const allPages = typeLine ? [...typeLine[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]) : [];
if (!allPages.length) { console.error('Could not read the page ids from App.tsx.'); process.exit(2); }
const wanted = process.argv.slice(3);

// Extra states of a page (a toggle open, a dialog showing, a tab picked), each a snippet run in the page before the
// shot. They are photographed too when no page or state is named: <folder>/<state>-<width>x<height>.png.
const sleep = 'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));';
const click = "const click = (sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => !text || x.textContent.trim().toLowerCase().includes(text.toLowerCase())); if (!e) throw new Error('not found: ' + sel + ' ' + text); e.click(); return e; };";
const typeInto = "const typeInto = (el, v) => { const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };";
const run = (body) => `(async () => { ${sleep} ${click} ${typeInto} ${body} })()`;
const STATES = {
  'armory-remove': { page: 'armory', js: run("click('button[aria-label=\"Remove Spare Saber\"]'); await sleep(700);") },
  'about-licence': { page: 'about', js: run("click('button', 'show the licence'); await sleep(900);") },
  'about-notices': { page: 'about', js: run("click('button', 'show the third-party notices'); await sleep(900);") },
  'looks-battery': { page: 'looks', js: run("click('button, li, [role=button]', 'Battery gauge'); await sleep(500);") },
  'looks-paste': { page: 'looks', js: run("click('button', 'paste style code'); await sleep(500);") },
  'presets-sets': { page: 'presets', js: run("click('[role=tab]', 'sets'); await sleep(400);") },
  'presets-history': { page: 'presets', js: run("click('[role=tab]', 'history'); await sleep(600);") },
  'editor-full': { page: 'editor', js: run("click('[role=tab]', 'full'); await sleep(700);") },
  'fonts-preset': { page: 'fonts', js: run("click('[role=tab]', 'preset fonts'); await sleep(500);") },
  'fonts-add': { page: 'fonts', js: run("click('[role=tab]', 'add a font'); await sleep(500);") },
  'fonts-tracks': { page: 'fonts', js: run("click('[role=tab]', 'tracks'); await sleep(500);") },
  'fonts-selected': { page: 'fonts', js: run("click('tbody tr:not(.grp)'); await sleep(400); click('[role=tab]', 'selected font'); await sleep(500);") },
  // In-app updates, each state pretended by HILTWRIGHT_UPDATE_STATE (development only; nothing reaches GitHub).
  // update-refused: the saber's card shared (the fake-shared aid), then Restart to update pressed.
  'update-available': { page: 'about', env: { HILTWRIGHT_UPDATE_STATE: 'available' }, js: run('await sleep(600);') },
  'update-downloading': { page: 'about', env: { HILTWRIGHT_UPDATE_STATE: 'downloading:42' }, js: run('await sleep(600);') },
  'update-ready': { page: 'about', env: { HILTWRIGHT_UPDATE_STATE: 'ready' }, js: run('await sleep(600);') },
  'update-refused': { page: 'about', env: { HILTWRIGHT_UPDATE_STATE: 'ready' }, js: run("window.hiltwrightGoto('fake-shared:about'); await sleep(900); click('.panel button', 'restart to update'); await sleep(900); console.log('[updates] shot check: ' + (document.querySelector('[role=alert]')?.textContent ?? 'no refusal shown'));") },
  'update-failed': { page: 'about', env: { HILTWRIGHT_UPDATE_STATE: 'failed' }, js: run('await sleep(600);') },
  'update-latest': { page: 'about', env: { HILTWRIGHT_UPDATE_STATE: 'latest' }, js: run('await sleep(600);') },
  'diag-reboot': { page: 'diag', js: run("const i = document.querySelector('input[placeholder=\"Type a command\"]'); i.focus(); typeInto(i, 'reboot'); await sleep(200); i.form.requestSubmit(); await sleep(600);") },
};
// The guided tour: its steps are counted from its words (src/renderer/src/tourSteps.ts: one `title:` per step; a test
// keeps that true). Each step is shown by the development aid hiltwrightTour(n), which waits until it is placed.
const tourSource = readFileSync(join(desktop, 'src/renderer/src/tourSteps.ts'), 'utf8');
const TOUR_COUNT = (tourSource.match(/^\s*title: '/gm) ?? []).length;
const pad = (n) => String(n).padStart(2, '0');
const tourJs = (n) => `window.hiltwrightTour(${n - 1})`;
for (let n = 1; n <= TOUR_COUNT; n++) STATES[`tour-${n}`] = { page: 'armory', js: tourJs(n), file: `tour-${pad(n)}` };
STATES['tour-offer'] = { page: 'armory', js: run("window.hiltwrightTourOffer(); await sleep(500);") };
STATES['tour-entry-side'] = { page: 'armory', js: run("document.querySelector('[data-tour=\"side-tour\"]').focus(); await sleep(300);") };
STATES['tour-entry-top'] = { page: 'presets', js: run("document.querySelector('[data-tour=\"top-tour\"]').focus(); await sleep(300);") };
// Started from Presets: a write tried during the tour, the keys, then Escape. The shot is the page after it ended,
// and the run log says what was refused, where the keys took the tour and what was back afterwards.
STATES['tour-ended'] = { page: 'presets', js: run(`
  await window.hiltwrightTour(14);
  let r; try { await window.hiltwright.library.update('fixture0001', { presets: [] }); r = 'written'; } catch (e) { r = 'refused: ' + String(e.message).replace(/^.*Error: /, ''); }
  console.log('[tour] step check: library.update during the tour -> ' + r);
  const key = (k) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('ArrowRight'); await sleep(1200); key('ArrowRight'); await sleep(1200); key('ArrowLeft'); await sleep(1200);
  console.log('[tour] step check: Right, Right, Left -> ' + document.querySelector('.tourcard .mono').textContent + ', focus on "' + document.activeElement.textContent + '"');
  key('Escape'); await sleep(2500);
  const lib = await window.hiltwright.library.list();
  console.log('[tour] step check: after Escape, tour ' + (document.querySelector('.tour') ? 'still open' : 'gone') + ', page ' + document.querySelector('h1').textContent + ', top bar ' + document.querySelector('.ident b').textContent + ', library ' + lib.map((s) => s.id + ' ' + s.presets.length + ' presets').join(', ') + ', focus on "' + (document.activeElement && document.activeElement.textContent) + '"');
`) };
// Every step in one run: a series (HILTWRIGHT_SHOTS) rather than a start of the app per step.
const SERIES = { tour: { page: 'armory', shots: Array.from({ length: TOUR_COUNT }, (_v, k) => ({ name: `tour-${pad(k + 1)}`, js: tourJs(k + 1) })) } };
// Font library with several fonts selected, in every theme (the theme is switched in the page, so one run does all),
// then the remove question, the keys, and a copy of the selected fonts to the fixture card with its report. Nothing is
// removed: that would put the fixture's folders in the real recycle bin.
const themeIds = [...readFileSync(join(desktop, 'src/shared/themes.ts'), 'utf8').matchAll(/^\s*id: '([a-z0-9-]+)'/gm)].map((m) => m[1]);
const rowClick = "const rowClick = (i, mods = {}) => { const rows = [...document.querySelectorAll('[data-tour=\"library-row\"]')]; if (!rows[i]) throw new Error('no row ' + i); rows[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...mods })); };";
const said = "const said = (what) => console.log('[shots] ' + what + ': ' + (document.querySelector('[aria-label=\"Selected fonts\"] h2, [aria-label=\"Selected font\"] h2')?.textContent ?? 'nothing selected') + ', ' + document.querySelectorAll('tr[aria-selected=\"true\"]').length + ' rows marked');";
const many = (body) => run(`${rowClick} ${said} ${body}`);
SERIES['library-many'] = { page: 'library', shots: [
  { name: 'library-many-setup', js: many("rowClick(1); await sleep(200); said('click row 2'); rowClick(3, { ctrlKey: true }); await sleep(200); said('ctrl+click row 4'); rowClick(3, { ctrlKey: true }); await sleep(200); said('ctrl+click row 4 again'); rowClick(6, { shiftKey: true }); await sleep(200); said('shift+click row 7'); rowClick(9, { ctrlKey: true }); await sleep(300); said('ctrl+click row 10');") },
  ...themeIds.map((id) => ({ name: `library-many-${id}`, js: run(`document.documentElement.dataset.theme = '${id}'; await sleep(500);`) })),
  { name: 'library-many-remove', js: many(`document.documentElement.dataset.theme = '${themeIds[0]}'; click('[aria-label="Selected fonts"] button', 'remove'); await sleep(400); console.log('[shots] remove asks: ' + document.querySelector('[aria-label="Selected fonts"] [role=alert]')?.textContent + ' | buttons: ' + [...document.querySelectorAll('[aria-label="Selected fonts"] .btn')].map((b) => b.textContent).join(' / '));`) },
  { name: 'library-many-keys', js: many("const key = (k, mods = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })); key('Escape'); await sleep(300); said('Escape'); key('a', { ctrlKey: true }); await sleep(300); said('Ctrl+A'); const q = document.querySelector('input[aria-label=\"Search fonts\"]'); q.focus(); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200); said('Escape typed in the search box'); q.blur();") },
  { name: 'library-many-copied', js: many("click('[aria-label=\"Selected fonts\"] button', 'copy'); for (let i = 0; i < 100 && !document.querySelector('.note[role=status]'); i++) await sleep(200); await sleep(300); console.log('[shots] copy report: ' + [...document.querySelectorAll('.note[role=status] span.small')].map((s) => s.textContent).join(' | ')); console.log('[shots] copy headline: ' + document.querySelector('.note[role=status] > span > span')?.textContent);") },
] };
// The fixture library exported to one file and that file imported again (every font is already here, so none is
// added). HILTWRIGHT_DIALOG_FILE answers both dialogs; the file is made in the OS temp folder and deleted afterwards.
const exportFile = join(tmpdir(), `hiltwright-shots-export-${process.pid}.hwfonts`);
process.on('exit', () => rmSync(exportFile, { force: true }));
const noteSaid = "const noteSaid = async (what) => { for (let i = 0; i < 150 && (document.querySelector('.spinner.on') || !document.querySelector('.note.green, .note.amber, .note.red')); i++) await sleep(200); console.log('[shots] ' + what + ': ' + (document.querySelector('.note.green, .note.amber, .note.red')?.textContent ?? 'nothing said')); };";
// Five fonts are selected and exported with a passphrase (made up here, used nowhere else); the import is tried with
// a wrong passphrase, then the right one.
const pass = (label, v) => `typeInto(document.querySelector('input[aria-label="${label}"]'), '${v}'); await sleep(150);`;
const exp = (body) => run(`${rowClick} ${noteSaid} ${body}`);
SERIES['library-export'] = { page: 'library', env: { HILTWRIGHT_DIALOG_FILE: exportFile }, shots: [
  { name: 'library-export-form', js: exp(`rowClick(1); await sleep(150); rowClick(5, { shiftKey: true }); await sleep(300); click('[aria-label="Selected fonts"] button', 'export'); await sleep(300); ${pass('Passphrase for the export, optional', 'shots-fixture-phrase')} ${pass('The passphrase again', 'shots-fixture-phrasf')} console.log('[shots] passphrases differ: ' + (document.querySelector('form[aria-label="Export fonts"] [role=alert]')?.textContent ?? 'nothing said') + ' | save button ' + (document.querySelector('form[aria-label="Export fonts"] button[type=submit]').disabled ? 'off' : 'on')); ${pass('The passphrase again', 'shots-fixture-phrase')}`) },
  { name: 'library-export-saved', js: exp(`click('form[aria-label="Export fonts"] button', 'choose where'); await sleep(300); await noteSaid('export');`) },
  { name: 'library-export-locked', js: exp(`click('.toolbar button', 'add export file'); for (let i = 0; i < 50 && !document.querySelector('form[aria-label="Passphrase for the import"]'); i++) await sleep(200); console.log('[shots] import asks: ' + document.querySelector('form[aria-label="Passphrase for the import"] span span')?.textContent);`) },
  { name: 'library-export-wrong', js: exp(`${pass('Passphrase for the file', 'not-the-phrase')} click('form[aria-label="Passphrase for the import"] button', 'add the fonts'); await sleep(2500); console.log('[shots] wrong passphrase: ' + document.querySelector('form[aria-label="Passphrase for the import"] span span')?.textContent);`) },
  { name: 'library-export-imported', js: exp(`${pass('Passphrase for the file', 'shots-fixture-phrase')} click('form[aria-label="Passphrase for the import"] button', 'add the fonts'); await sleep(500); await noteSaid('import');`) },
] };
// A bundle exported from its heading in the By bundle view.
STATES['library-bundle'] = { page: 'library', env: { HILTWRIGHT_DIALOG_FILE: exportFile }, js: run(`${noteSaid} click('.seg button', 'by bundle'); await sleep(400); click('button[aria-label="Export the bundle Prequel set"]'); await sleep(300); console.log('[shots] form: ' + document.querySelector('form[aria-label="Export fonts"] span span')?.textContent.slice(0, 70)); click('form[aria-label="Export fonts"] button', 'choose where'); await sleep(300); await noteSaid('export bundle');`) };
// One font exported from its own panel, with no passphrase.
STATES['library-export-one'] = { page: 'library', env: { HILTWRIGHT_DIALOG_FILE: exportFile }, js: run(`${rowClick} ${noteSaid} rowClick(2); await sleep(300); click('[aria-label="Selected font"] button', 'export'); await sleep(300); console.log('[shots] form: ' + document.querySelector('form[aria-label="Export fonts"] span span')?.textContent.slice(0, 80)); click('form[aria-label="Export fonts"] button', 'choose where'); await sleep(300); await noteSaid('export one');`) };
const isSingleTour = (name) => /^tour-\d+$/.test(name);
const allNames = [...allPages, ...Object.keys(STATES), ...Object.keys(SERIES)];
for (const p of wanted) if (!allNames.includes(p)) { console.error(`Unknown page or state "${p}". Pages: ${allPages.join(', ')}. States: ${Object.keys(STATES).filter((n) => !isSingleTour(n)).join(', ')}, tour, tour-1 to tour-${TOUR_COUNT}`); process.exit(2); }
const jobs = (wanted.length ? wanted : allNames.filter((n) => !isSingleTour(n))).map((name) => (SERIES[name] ? { name, ...SERIES[name] } : STATES[name] ? { name, ...STATES[name] } : { name, page: name }));

// Fixtures: a saber remembered in the app's data folder, a font library, and a card, all made up.
function wav(seconds = 0.1) {
  const data = Buffer.alloc(Math.round(44100 * 2 * seconds));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const SOUNDS = ['hum01', 'hum02', 'out01', 'out02', 'in01', 'in02', 'clsh01', 'clsh02', 'clsh03', 'blst01', 'blst02', 'swng01', 'swng02', 'swng03', 'swng04', 'lock01', 'boot01', 'font01', 'force01', 'stab01', 'swingh01', 'swingl01', 'drag01', 'melt01'];
function makeFont(root, name) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const s of SOUNDS) writeFileSync(join(dir, `${s}.wav`), wav(s.startsWith('hum') ? 0.4 : 0.1));
  writeFileSync(join(dir, 'config.ini'), 'humstart=300\n');
}

const base = mkdtempSync(join(tmpdir(), 'hiltwright-shots-'));
const userData = join(base, 'userData');
const fontLibrary = join(base, 'fontlibrary');
const card = join(base, 'card');
for (const d of [userData, fontLibrary, card]) mkdirSync(d, { recursive: true });

const libFonts = ['Obi-Wan_Kenobi_Revenge_of_the_Sith', 'Kylo_Ren_Crossguard_Unstable', 'Ahsoka_Tano_Shoto_Pair', 'Mace_Windu_Purple', 'Darth_Maul_Double_Bladed', 'Luke_Skywalker_Return_Of_The_Jedi', 'Cal_Kestis_Fallen_Order', 'Rey_Skywalker_Yellow', 'Qui-Gon_Jinn_Phantom_Menace', 'Starkiller_Force_Unleashed', 'Count_Dooku_Curved_Hilt', 'Grand_Inquisitor_Spinning', 'Yoda_Green_Short', 'Revan_Knights_Of_The_Old_Republic'];
const makers = ['Kyberphonic', 'Greyscale Audio', 'Shadowfoil', '', 'Vader’s Workshop', 'Kyberphonic', '', 'Greyscale Audio', 'Shadowfoil', '', 'Kyberphonic', '', 'Greyscale Audio', ''];
const index = { version: 1, fonts: {}, makers: {} };
libFonts.forEach((f, i) => {
  makeFont(fontLibrary, f);
  index.fonts[f] = { name: f.replace(/_/g, ' '), maker: makers[i], notes: i % 3 === 0 ? 'Needs the volume up a notch; the swings are quiet.' : '', added: '2026-10-0' + (1 + (i % 9)) + 'T10:00:00.000Z', ...(i < 4 ? { bundle: 'Prequel set' } : i < 6 ? { bundle: 'Sequel set' } : {}) };
});
writeFileSync(join(fontLibrary, 'hiltwright-fonts.json'), JSON.stringify(index));
// One maker with a logo and a link, so an export has a maker to carry.
mkdirSync(join(userData, 'contributors'), { recursive: true });
writeFileSync(join(userData, 'contributors', 'kyberphonic.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#2a6"/><path d="M2 6V2l4 4V2" stroke="#fff" fill="none"/></svg>');
writeFileSync(join(userData, 'contributors.json'), JSON.stringify({ version: 1, people: { Kyberphonic: { logo: 'kyberphonic.svg', url: 'https://example.com/' } } }));

// The card has most of the library's fonts, one with a missing hum, and tracks.
libFonts.slice(0, 9).forEach((f) => makeFont(card, f));
mkdirSync(join(card, 'tracks'), { recursive: true });
for (const t of ['duel_of_the_fates.wav', 'imperial_march.wav', 'binary_sunset.wav']) writeFileSync(join(card, 'tracks', t), wav(1));
writeFileSync(join(card, 'presets.ini'), '');
rmSync(join(card, 'Mace_Windu_Purple', 'hum01.wav'));
rmSync(join(card, 'Mace_Windu_Purple', 'hum02.wav'));

const presetFonts = ['Obi-Wan_Kenobi_Revenge_of_the_Sith', 'Kylo_Ren_Crossguard_Unstable', 'Ahsoka_Tano_Shoto_Pair', 'Mace_Windu_Purple', 'Cal_Kestis_Fallen_Order', 'Yoda_Green_Short', 'Not_In_Library_Anywhere'];
const now = new Date().toISOString();
writeFileSync(join(userData, 'library.json'), JSON.stringify({
  version: 1,
  sabers: [{
    id: 'fixture0001', name: 'Fixture Saber', firstSeen: now, lastSeen: now,
    identity: { usbSerial: 'FIXTURE0001', configName: 'hiltwright_fixture_saber', version: '8.x', prop: 'saber', buttons: 2, installed: now, pixelBlades: [144], bladeConfig: 0 },
    presets: presetFonts.map((font, i) => ({ font, track: `tracks/${['duel_of_the_fates', 'imperial_march', 'binary_sunset'][i % 3]}.wav`, styles: [`builtin ${i} 1`], name: font.replace(/_/g, ' ').slice(0, 24), variation: 0 })),
    fonts: presetFonts, tracks: ['duel_of_the_fates.wav'],
  }, {
    // A saber seen before and not plugged in now: the one the Armory offers to remove.
    id: 'fixture0002', name: 'Spare Saber', firstSeen: '2026-10-01T10:00:00.000Z', lastSeen: '2026-10-20T10:00:00.000Z',
    identity: { usbSerial: 'FIXTURE0002', configName: 'hiltwright_spare_saber', version: '8.x', prop: 'saber', buttons: 2, installed: '2026-10-01T10:00:00.000Z', pixelBlades: [132], bladeConfig: 0 },
    presets: presetFonts.slice(0, 3).map((font, i) => ({ font, track: '', styles: [`builtin ${i} 1`], name: font.replace(/_/g, ' ').slice(0, 24), variation: 0 })),
    fonts: presetFonts.slice(0, 3), tracks: [],
  }],
}));

const env = {
  ...process.env,
  HILTWRIGHT_NO_BOARD: '1',
  HILTWRIGHT_OFFSCREEN: '1',
  HILTWRIGHT_USER_DATA: userData,
  HILTWRIGHT_FONT_LIBRARY: fontLibrary,
  HILTWRIGHT_SD_ROOT: card,
};
delete env.ELECTRON_RUN_AS_NODE;
// The one thing this script must never run without.
if (env.HILTWRIGHT_NO_BOARD !== '1') { console.error('Could not set HILTWRIGHT_NO_BOARD. Not starting the app.'); process.exit(1); }

mkdirSync(outDir, { recursive: true });

// Pages that only show their detail once something is picked: pick the first font in the list before the shot.
const PICK_FIRST_ROW = "document.querySelector('tbody tr:not(.grp)')?.click()";
const OPEN = { fonts: PICK_FIRST_ROW, library: PICK_FIRST_ROW };
const viteBin = join(desktop, '../../node_modules/electron-vite/bin/electron-vite.js');

function shoot({ name, page, js, file: fileName, shots, env: extraEnv }, { w, h }) {
  const file = resolve(outDir, `${fileName ?? name}-${w}x${h}.png`);
  // The tour brings its own example saber, so its shots start from a plain page rather than the fixture's fake connection.
  const tour = name.startsWith('tour');
  return new Promise((done) => {
    const shotEnv = { ...env, ...extraEnv, HILTWRIGHT_W: String(w), HILTWRIGHT_H: String(h), HILTWRIGHT_PAGE: tour ? page : `fake:${page}` };
    if (shots) shotEnv.HILTWRIGHT_SHOTS = JSON.stringify(shots.map((s) => ({ file: resolve(outDir, `${s.name}-${w}x${h}.png`), js: s.js })));
    else shotEnv.HILTWRIGHT_SHOT = file;
    if (!shots && (js ?? OPEN[page])) shotEnv.HILTWRIGHT_SHOT_JS = js ?? OPEN[page];
    const child = spawn(process.execPath, [viteBin, 'dev'], { cwd: desktop, env: shotEnv });
    let log = '';
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
      if (!ok) console.error(`${name} ${w}x${h}: failed\n${log.split('\n').slice(-15).join('\n')}`);
      else console.log(`${name} ${w}x${h}: ${shots ? `${shots.length} shots in ${outDir}` : file}`);
      // Where each tour card went, and anything wrong with it (Tour.tsx logs one line per step it places).
      if (tour) for (const l of log.split('\n')) if (/\[tour\] (step|refused|not )/.test(l)) console.log(`  ${l.replace(/^.*?\[tour\]/, '[tour]').trim()}`);
      // What a series said about itself as it went (lines it logged as [shots]).
      for (const l of log.split('\n')) if (l.includes('[shots] ')) console.log(`  ${l.replace(/^.*?\[shots\]/, '[shots]').trim()}`);
      setTimeout(() => done(ok), 1500);
    };
    const timer = setTimeout(() => finish(false), shots ? 600000 : 120000);
    const doneLine = shots ? '[main] screenshots done' : '[main] screenshot';
    const onData = (d) => { log += d; if (log.includes(doneLine)) finish(true); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => finish(log.includes(doneLine)));
  });
}

let failed = 0;
try {
  for (const size of SIZES) for (const job of jobs) if (!(await shoot(job, size))) failed++;
} finally {
  rmSync(base, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
