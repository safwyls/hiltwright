// Builds the Hiltwright website into site/dist: promo pages (src/pages), the docs (content/docs, plus the install
// guide and release notes straight from the repo's docs/ folder), and the live blade demo (the app's own simulator
// from packages/core, bundled for the browser).
//
//   npm run build     (in site/)
//
// Every link is relative, so the site works at any path. It is published at hiltwright.com.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { marked } from 'marked';
import { buildWorkshop } from './workshop.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const dist = join(here, 'dist');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const VERSION = JSON.parse(read(join(repo, 'package.json'))).version;
const REPO_URL = 'https://github.com/safwyls/hiltwright';
const RELEASES_URL = `${REPO_URL}/releases`;
const ISSUES_URL = `${REPO_URL}/issues`;
const tour = JSON.parse(read(join(here, 'data/tour.json')));
// The app's themes (written by scripts/capture.mjs) and their paintings, which live with the app.
const themes = JSON.parse(read(join(here, 'data/themes.json')));
const feature = JSON.parse(read(join(here, 'data/feature.json')));
const PLANES_DIR =join(repo, 'apps/desktop/src/renderer/src/assets/backdrops');
const isPicture = (f) => /\.(jpe?g|webp|png)$/i.test(f);
const paintings = new Map(readdirSync(PLANES_DIR).filter(isPicture).map((f) => [f.replace(/\.[^.]+$/, ''), f]));
// The theme in front when the home page opens.
const FIRST_THEME = 'crait';
if (!themes.some((t) => t.id === FIRST_THEME)) throw new Error(`themes.json has no "${FIRST_THEME}" theme`);

// The site's accent follows the theme the visitor chose on the home page's deck. For each theme: the accent, a
// lighter one for hover, and whichever of light or dark lettering reads better on it.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const lighten = (hex, by) => `#${rgb(hex).map((v) => Math.round(v + (255 - v) * by).toString(16).padStart(2, '0')).join('')}`;
const INK_LIGHT = '#fff6f4', INK_DARK = '#0a0b0d';
const ACCENTS = Object.fromEntries(themes.map((t) => {
  if (!/^#[0-9a-f]{6}$/i.test(t.accent ?? '')) throw new Error(`themes.json: the ${t.id} theme has no accent colour`);
  return [t.id, [t.accent, lighten(t.accent, 0.16), contrast(t.accent, INK_LIGHT) >= contrast(t.accent, INK_DARK) ? INK_LIGHT : INK_DARK]];
}));
// Runs in the head of every page, before anything paints: the accent of the theme chosen last time, or the first.
// It also redraws the browser tab's icon with its blade in that accent.
const accentScript = () => `<script>(()=>{const A=${JSON.stringify(ACCENTS)},I=${JSON.stringify(FAVICON)},s=document.documentElement.style;const put=(id)=>{const a=A[id];if(!a)return false;s.setProperty('--lamp',a[0]);s.setProperty('--lamp-hi',a[1]);s.setProperty('--lamp-ink',a[2]);const l=document.querySelector('link[rel=icon]');if(l)l.href='data:image/svg+xml,'+encodeURIComponent(I.split('currentColor').join(a[0]));return true};let t=null;try{t=localStorage.getItem('hw-theme')}catch{}if(!put(t))put('${FIRST_THEME}');window.hwAccent=(id)=>{if(put(id))try{localStorage.setItem('hw-theme',id)}catch{}}})()</script>`;

// The mark beside the wordmark: the app's own icon, redrawn in the site's graphite, with its blade in the accent
// colour (currentColor), so it changes with the chosen theme. Each copy on a page gets its own ids.
const ICON_SOURCE = read(join(repo, 'apps/desktop/src/renderer/src/assets/hiltwright-icon.svg'));
const ICON_COLOURS = { '#f0873a': 'currentColor', '#e2b84a': 'currentColor', '#8a8274': '#868c92', '#d6cdb9': '#d5dade', '#1e1a15': '#181a1d', '#3d362c': '#363b40', '#1c1813': '#1b1e21', '#13100c': '#101214', '#5e5240': '#4b5158', '#30291f': '#2a2e32', '#fff6e2': '#ffffff' };
for (const c of Object.keys(ICON_COLOURS)) if (!ICON_SOURCE.includes(c)) throw new Error(`hiltwright-icon.svg no longer uses ${c}: update ICON_COLOURS in build.mjs`);
const icon = (suffix) => {
  let svg = ICON_SOURCE.replace(/<title[^>]*>.*?<\/title>/, '').replace(/ role="img" aria-labelledby="t"/, ' aria-hidden="true" focusable="false"').replace(/ width="256" height="256"/, ' width="30" height="30"');
  for (const [from, to] of Object.entries(ICON_COLOURS)) svg = svg.split(from).join(to);
  for (const id of ['steel', 'grip', 'tile', 'halo', 'inside']) svg = svg.split(`id="${id}"`).join(`id="${id}-${suffix}"`).split(`url(#${id})`).join(`url(#${id}-${suffix})`);
  return svg.replace(/\n\s*/g, '');
};
// The browser tab's icon: the same drawing at full size. The page's script fills in the accent; the file served
// to a browser with scripts off carries the first theme's.
const FAVICON = icon('tab').replace(' width="30" height="30"', ' width="256" height="256"').replace(' aria-hidden="true" focusable="false"', '');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** `---\nkey: value\n---\nbody` to { meta, body }. */
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: text.slice(m[0].length) };
}

const NAV = [
  { id: 'features', href: 'features.html', label: 'Features' },
  { id: 'walkthrough', href: 'walkthrough.html', label: 'Walkthrough' },
  { id: 'workshop', href: 'workshop/index.html', label: 'Workshop' },
  { id: 'docs', href: 'docs/index.html', label: 'Docs' },
  { id: 'download', href: 'download.html', label: 'Download' },
];

function layout({ title, description, nav, root, body, cls = '', scripts = [] }) {
  const full = title ? `${title} · Hiltwright` : 'Hiltwright: ProffieOS without the compiler';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#121416">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:image" content="https://hiltwright.com/assets/themes/${FIRST_THEME}.jpg">
<link rel="icon" type="image/svg+xml" href="${root}assets/brand/hiltwright-icon.svg">
<link rel="preload" href="${root}assets/fonts/gloock-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/site.css">
${accentScript()}
</head>
<body class="${`${cls} p-${nav ?? 'none'}`.trim()}">
<a class="skip" href="#main">Skip to the content</a>
<header class="top">
  <div class="wrap bar">
    <a class="brand" href="${root}index.html" aria-label="Hiltwright, home">${icon('top')}Hiltwright</a>
    <button class="menu" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav id="nav" aria-label="Site">
      ${NAV.filter((n) => n.id !== 'download').map((n) => `<a href="${root}${n.href}"${n.id === nav ? ' aria-current="page"' : ''}>${n.label}</a>`).join('\n      ')}
      <a href="${REPO_URL}">GitHub</a>
      <a class="get" href="${root}download.html"${nav === 'download' ? ' aria-current="page"' : ''}>Download</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="wrap footgrid">
    <div>
      <a class="brand" href="${root}index.html">${icon('foot')}Hiltwright</a>
      <p>ProffieOS for people who don't want to write code. Version ${esc(VERSION)}, a beta for Windows and macOS.</p>
    </div>
    <div><p class="foot-h">Site</p><a href="${root}features.html">Features</a><a href="${root}walkthrough.html">Walkthrough</a><a href="${root}workshop/index.html">Workshop</a><a href="${root}download.html">Download</a></div>
    <div><p class="foot-h">Docs</p><a href="${root}docs/install.html">Install guide</a><a href="${root}docs/quick-start.html">Quick start</a><a href="${root}docs/troubleshooting.html">Troubleshooting</a><a href="${root}docs/faq.html">Questions</a></div>
    <div><p class="foot-h">Project</p><a href="${REPO_URL}">Source on GitHub</a><a href="${ISSUES_URL}">Report a problem</a><a href="${RELEASES_URL}">Releases</a><a href="${REPO_URL}/blob/main/LICENSE">License: GPL-3.0-or-later</a></div>
  </div>
  <div class="wrap legal">Hiltwright is an independent, open-source project, not affiliated with or endorsed by the ProffieOS project, any board or saber maker, or Lucasfilm Ltd. ProffieOS and Proffieboard are the work of Fredrik Hübinette. All other names belong to their owners.</div>
</footer>
<script src="${root}assets/site.js" defer></script>
${scripts.map((s) => `<script src="${root}${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// ---------- start clean, copy what is served as it is ----------
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'docs'), { recursive: true });
cpSync(join(here, 'assets'), join(dist, 'assets'), { recursive: true });
mkdirSync(join(dist, 'assets/img'), { recursive: true });
cpSync(join(repo, 'docs/images/smart-app-control.png'), join(dist, 'assets/img/smart-app-control.png'));
mkdirSync(join(dist, 'assets/planes'), { recursive: true });
for (const f of paintings.values()) cpSync(join(PLANES_DIR, f), join(dist, 'assets/planes', f));
writeFileSync(join(dist, 'assets/brand/hiltwright-icon.svg'), FAVICON.split('currentColor').join(ACCENTS[FIRST_THEME][0]));
for (const t of themes) if (!existsSync(join(here, 'assets/themes', `${t.id}.jpg`))) throw new Error(`no picture of the ${t.id} theme: run npm run capture`);
writeFileSync(join(dist, '.nojekyll'), '');

// ---------- the live blade demo: the app's simulator, for the browser ----------
await build({ entryPoints: [join(here, 'src/blade-demo.ts')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: join(dist, 'assets/blade-demo.js'), logLevel: 'warning' });

// ---------- the workshop: the app's Styles page and style editor, in the browser (workshop.mjs) ----------
await buildWorkshop({ repo, dist, layoutHead: '<link rel="icon" type="image/svg+xml" href="../assets/brand/hiltwright-icon.svg">' });

// ---------- docs ----------
const SECTIONS = ['Getting started', 'Install', 'Live', 'The workshop', 'Tools', 'Help'];
const docs = [];
for (const f of readdirSync(join(here, 'content/docs')).filter((x) => x.endsWith('.md'))) {
  const { meta, body } = frontmatter(read(join(here, 'content/docs', f)));
  docs.push({ slug: f.replace(/\.md$/, ''), ...meta, order: Number(meta.order ?? 99), md: body });
}
// Two pages come straight from the repo's docs, so there is one copy of each to keep right.
const fromRepo = (file, extra) => {
  const md = read(join(repo, 'docs', file)).replace(/^# .*\n+/, '').replace(/\]\(images\//g, '](img/');
  docs.push({ md, ...extra });
};
fromRepo('install-guide.md', { slug: 'install', title: 'Install guide', summary: 'From the download to your first firmware install, including every Windows warning for unsigned software.', section: 'Getting started', order: 2 });
fromRepo('release-notes-beta-17.md', { slug: 'release-notes', title: `Release notes: ${VERSION}`, summary: 'What this beta promises, what is hidden, and what is not in it yet.', section: 'Help', order: 9 });
docs.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);
for (const d of docs) if (!SECTIONS.includes(d.section)) throw new Error(`${d.slug}: unknown section "${d.section}"`);

function renderDoc(d) {
  let html = marked.parse(d.md, { gfm: true });
  const toc = [];
  const seen = new Set();
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
    let id = slugify(inner) || 'section';
    while (seen.has(id)) id += '-2';
    seen.add(id);
    if (level === '2') toc.push({ id, text: plain(inner) });
    return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${level}>`;
  });
  html = html
    .replace(/<blockquote>\s*<p><strong>(Note|Tip|Warning):?<\/strong>:?/g, (_m, kind) => `<blockquote class="callout ${kind.toLowerCase()}"><p><strong>${kind}</strong>`)
    .replace(/<img src="shots\/([^"]+)"/g, '<img loading="lazy" width="1480" height="980" src="../assets/shots/$1"')
    .replace(/<img src="img\/([^"]+)"/g, '<img loading="lazy" src="../assets/img/$1"')
    .replace(/<p>(<img [^>]+alt="([^"]*)"[^>]*>)<\/p>/g, (_m, img, alt) => `<figure class="shot"><a href="${/src="([^"]+)"/.exec(img)[1]}">${img}</a>${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`)
    .replace(/<table>/g, '<div class="tablewrap"><table>').replace(/<\/table>/g, '</table></div>')
    .replace(/<a href="(https?:[^"]+)"/g, '<a rel="noopener" href="$1"');
  return { html, toc };
}

const sidebar = (current) => SECTIONS.map((s) => `<div class="sec">${s}</div>\n` + docs.filter((d) => d.section === s).map((d) => `<a href="${d.slug}.html"${d.slug === current ? ' aria-current="page"' : ''}>${esc(d.title)}</a>`).join('\n')).join('\n');
const docsIndex = () => SECTIONS.map((s) => `<h2>${s}</h2>\n<div class="doccards">` + docs.filter((d) => d.section === s && d.slug !== 'index').map((d) => `<a class="doccard" href="${d.slug}.html"><b>${esc(d.title)}</b><span>${esc(d.summary ?? '')}</span></a>`).join('\n') + '</div>').join('\n');

const search = [];
const ordered = docs.filter((d) => d.slug !== 'index');
for (const d of docs) {
  let { html, toc } = renderDoc(d);
  if (d.slug === 'index') { html = html.replace('<p>{{docs-index}}</p>', docsIndex()); toc = []; }
  const i = ordered.indexOf(d);
  const prev = i > 0 ? ordered[i - 1] : null, next = i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : d.slug === 'index' ? ordered[0] : null;
  const body = `<div class="wrap docs">
  <aside class="docnav" aria-label="Docs">
    <div class="docsearch"><label class="sr" for="q">Search the docs</label><input id="q" type="search" placeholder="Search the docs" autocomplete="off"><div id="hits" class="hits" hidden></div></div>
    <details class="docmenu" open><summary>All pages</summary><nav>${sidebar(d.slug)}</nav></details>
  </aside>
  <article class="doc">
    <p class="crumb"><a href="index.html">Docs</a>${d.slug === 'index' ? '' : ` / ${esc(d.section)}`}</p>
    <h1>${esc(d.title)}</h1>
    ${d.summary ? `<p class="lede">${esc(d.summary)}</p>` : ''}
    ${html}
    <nav class="pager" aria-label="More pages">${prev ? `<a class="prev" href="${prev.slug}.html"><span>Before</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}${next ? `<a class="next" href="${next.slug}.html"><span>Next</span><b>${esc(next.title)}</b></a>` : ''}</nav>
    <p class="editnote">Written for Hiltwright ${esc(VERSION)}. Something wrong or missing? <a href="${ISSUES_URL}">Tell us</a>.</p>
  </article>
  <aside class="toc" aria-label="On this page">${toc.length > 1 ? `<div class="sec">On this page</div>${toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join('')}` : ''}</aside>
</div>`;
  writeFileSync(join(dist, 'docs', `${d.slug}.html`), layout({ title: d.slug === 'index' ? 'Docs' : d.title, description: d.summary ?? 'Hiltwright documentation.', nav: 'docs', root: '../', body, cls: `docspage doc-${d.slug}`, scripts: ['assets/docs.js'] }));
  // Search: one entry per section of each page.
  const parts = html.split(/(?=<h2 id=")/);
  for (const part of parts) {
    const h = /^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/.exec(part);
    const text = plain(part.replace(/<a class="anchor"[\s\S]*?<\/a>/g, ''));
    if (text) search.push({ u: `${d.slug}.html${h ? `#${h[1]}` : ''}`, p: d.title, h: h ? plain(h[2].replace(/<a class="anchor"[\s\S]*?<\/a>/, '')) : '', t: text.slice(0, 1600) });
  }
}
writeFileSync(join(dist, 'docs/search.json'), JSON.stringify(search));

// ---------- promo pages ----------
// The home page's stage: a deck of app windows, one per theme. The first is in front; the rest stand behind it in
// order, each a step further back (--i). A card is a pointer shortcut only: the row of theme names is the one
// control a keyboard or a screen reader meets, so the cards are out of the tab order and hidden from assistive
// technology, and the deck as a whole is described once.
// The themes with no painting are spread out, so the two plainest windows never stand next to each other.
const unpainted = themes.filter((t) => !paintings.has(t.id));
const painted = themes.filter((t) => paintings.has(t.id));
const siteOrder = new Array(themes.length).fill(null);
unpainted.forEach((t, i) => { siteOrder[unpainted.length > 1 ? Math.round((i * (themes.length - 1)) / (unpainted.length - 1)) : 0] = t; });
for (const t of painted) siteOrder[siteOrder.indexOf(null)] = t;
themes.splice(0, themes.length, ...siteOrder);
const deckOrder = [themes.find((t) => t.id === FIRST_THEME), ...themes.filter((t) => t.id !== FIRST_THEME)];
const deck = deckOrder.map((t, i) => `<button type="button" class="pane${i ? '' : ' front'}" data-theme="${t.id}" style="--i:${i}" tabindex="-1" aria-hidden="true"><img src="assets/themes/${t.id}.jpg" width="1480" height="980" alt=""${i ? ' decoding="async"' : ''}></button>`).join('\n    ');
const themeButtons = themes.map((t) => `<button type="button" role="radio" data-theme="${t.id}" aria-checked="${t.id === FIRST_THEME}" tabindex="${t.id === FIRST_THEME ? 0 : -1}" title="${esc(t.about)}">${esc(t.name)}</button>`).join('\n    ');
const vars = { deck, themeButtons, themeCount: String(themes.length), firstTheme: FIRST_THEME, firstThemeName: esc(themes.find((t) => t.id === FIRST_THEME).name), version: VERSION, repo: REPO_URL, releases: RELEASES_URL, issues: ISSUES_URL, steps: String(tour.chapters.reduce((n, c) => n + c.steps.length, 0)), tour: JSON.stringify(tour).replace(/</g, '\\u003c') };
for (const f of readdirSync(join(here, 'src/pages')).filter((x) => x.endsWith('.html'))) {
  const { meta, body } = frontmatter(read(join(here, 'src/pages', f)));
  const filled = body.replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'root' ? '' : vars[k] ?? m))
    // A feature row's picture is the one taken in its own theme (scripts/capture.mjs), named under the picture.
    .replace(/<figure class="frame">(<img [^>]*?)src="assets\/shots\/clean-(\d\d)\.png"([^>]*>)<\/figure>/g, (m, a, n, b) => (feature[n] ? `<figure class="frame">${a}src="assets/feature/${n}.jpg"${b}<figcaption>Shown in the ${esc(feature[n].name)} theme</figcaption></figure>` : m));
  // The 404 page is served at any path, so its stylesheet, pictures and links start at the site's root.
  writeFileSync(join(dist, f), layout({ title: meta.title, description: meta.description, nav: meta.nav, root: f === '404.html' ? '/' : '', body: filled, cls: meta.class ?? '', scripts: (meta.scripts ?? '').split(',').map((s) => s.trim()).filter(Boolean) }));
}

// ---------- check every local link and image points at something that was built ----------
const built = new Set();
const walk = (dir, rel = '') => { for (const e of readdirSync(dir, { withFileTypes: true })) e.isDirectory() ? walk(join(dir, e.name), `${rel}${e.name}/`) : built.add(rel + e.name); };
walk(dist);
let broken = 0;
for (const page of [...built].filter((p) => p.endsWith('.html'))) {
  const html = read(join(dist, page));
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|data:)/.test(url) || url.startsWith('/')) continue; // the 404 page is served from any path, so its links start at the root
    const [path, hash] = url.split('#');
    if (!path) { if (hash && !ids.has(hash)) { console.error(`${page}: no #${hash} on the page`); broken++; } continue; }
    const target = join(dirname(page), path).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!built.has(target)) { console.error(`${page}: ${url} does not exist`); broken++; }
  }
}
console.log(`Built ${[...built].filter((p) => p.endsWith('.html')).length} pages (${docs.length} docs) into ${dist}${broken ? `, with ${broken} broken links` : ''}`);
if (broken) process.exit(1);
