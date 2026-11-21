// The walkthrough: the app's own tour (data/tour.json, written by scripts/capture.mjs), one step at a time.
(() => {
  const root = document.getElementById('wt');
  const data = JSON.parse(document.getElementById('tour-data').textContent);
  const steps = data.chapters.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c })));
  // Where each chapter's page is explained in the docs.
  const DOCS = { armory: 'armory', wiring: 'wiring', presets: 'presets', fonts: 'fonts-and-sd', build: 'build-and-install', looks: 'styles', editor: 'style-editor', library: 'font-library', contributors: 'contributors', demo: 'demo-room', diag: 'diagnostics', welcome: 'quick-start', about: 'faq' };
  const $ = (s) => root.querySelector(s);
  const img = $('.wt-shot img'), count = $('.wt-count'), title = $('.wt-title'), text = $('.wt-text'), prev = $('.wt-prev'), next = $('.wt-next'), doc = $('.wt-doc'), bar = $('.wt-bar i'), chapters = $('.wt-chapters');

  const buttons = data.chapters.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${c.name} <span>${c.steps.length}</span>`;
    b.addEventListener('click', () => show(steps.findIndex((s) => s.chapter === c), true));
    chapters.appendChild(b);
    return b;
  });

  let at = 0;
  function show(i, push) {
    at = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[at];
    img.src = `assets/shots/${s.shot}`;
    img.alt = `The app during the tour: ${s.title}`;
    count.textContent = `${s.chapter.name} · step ${at + 1} of ${steps.length}`;
    title.textContent = s.title;
    text.replaceChildren(...s.text.map((t) => Object.assign(document.createElement('p'), { textContent: t })));
    prev.disabled = at === 0;
    next.textContent = at === steps.length - 1 ? 'Start again' : 'Next';
    doc.href = `docs/${DOCS[s.chapter.id] ?? 'index'}.html`;
    doc.textContent = s.chapter.id === 'welcome' ? 'Quick start in the docs' : s.chapter.id === 'about' ? 'Questions and answers' : `${s.chapter.name.replace(/^\d /, '')} in the docs`;
    bar.style.width = `${((at + 1) / steps.length) * 100}%`;
    data.chapters.forEach((c, k) => { if (c === s.chapter) { buttons[k].setAttribute('aria-current', 'true'); buttons[k].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else buttons[k].removeAttribute('aria-current'); });
    if (push) history.replaceState(null, '', `#step-${at + 1}`);
    // Have the next picture ready.
    if (steps[at + 1]) new Image().src = `assets/shots/${steps[at + 1].shot}`;
  }
  prev.addEventListener('click', () => show(at - 1, true));
  next.addEventListener('click', () => show(at === steps.length - 1 ? 0 : at + 1, true));
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') show(at + 1, true);
    if (e.key === 'ArrowLeft') show(at - 1, true);
  });
  // A step can be linked to (#step-12), and the page follows when that part of the address is changed by hand.
  const fromHash = () => { const m = /^#step-(\d+)$/.exec(location.hash); return m ? Number(m[1]) - 1 : null; };
  window.addEventListener('hashchange', () => { const i = fromHash(); if (i !== null && i !== at) show(i, false); });
  show(fromHash() ?? 0, false);
})();
