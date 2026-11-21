// Docs pages: search, and the "on this page" marker.
(() => {
  const q = document.getElementById('q');
  const hits = document.getElementById('hits');
  let index = null;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function search() {
    const words = q.value.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) { hits.hidden = true; return; }
    // A failed load is said plainly and tried again on the next keystroke, not remembered as "nothing found".
    if (!index) {
      try { const r = await fetch('search.json'); if (!r.ok) throw new Error(String(r.status)); index = await r.json(); }
      catch { hits.hidden = false; hits.innerHTML = '<div class="none">Search could not load. Check your connection, or use the list of pages.</div>'; return; }
    }
    const found = [];
    for (const e of index) {
      const hay = `${e.p} ${e.h} ${e.t}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const head = `${e.p} ${e.h}`.toLowerCase();
      found.push({ e, score: words.filter((w) => head.includes(w)).length });
    }
    found.sort((a, b) => b.score - a.score);
    hits.hidden = false;
    if (!found.length) { hits.innerHTML = '<div class="none">Nothing found. Try one word, such as "backup" or "font".</div>'; return; }
    hits.innerHTML = found.slice(0, 12).map(({ e }) => {
      const at = Math.max(0, e.t.toLowerCase().indexOf(words[0]) - 40);
      let snip = esc(e.t.slice(at, at + 130));
      for (const w of words) snip = snip.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
      return `<a href="${e.u}"><b>${esc(e.p)}${e.h ? ` · ${esc(e.h)}` : ''}</b><span>${at ? '…' : ''}${snip}…</span></a>`;
    }).join('');
  }
  if (q) {
    q.addEventListener('input', search);
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; hits.hidden = true; } });
    // Arrow keys move from the field into the results and between them; Escape goes back to the field.
    const results = () => [...hits.querySelectorAll('a')];
    q.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && !hits.hidden && results().length) { e.preventDefault(); results()[0].focus(); } });
    hits.addEventListener('keydown', (e) => {
      const list = results(), i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { hits.hidden = true; q.focus(); return; }
      if (i < 0 || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && i === 0) q.focus(); else list[Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))].focus();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.docsearch')) hits.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); q.focus(); } });
  }
  // On a small screen the page list starts closed.
  const menu = document.querySelector('.docmenu');
  if (menu && matchMedia('(max-width:900px)').matches) menu.open = false;

  const links = [...document.querySelectorAll('.toc a')];
  if (links.length) {
    const heads = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
    const mark = () => {
      let on = 0;
      heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top < 120) on = i; });
      links.forEach((a, i) => a.classList.toggle('on', i === on));
    };
    addEventListener('scroll', mark, { passive: true });
    mark();
  }
})();
