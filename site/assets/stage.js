// The home page's stage: a deck of app windows, one per theme. Choosing a theme, by its name or by its window,
// brings that window to the front and moves the others one step back. Without this script the first theme stays
// in front.
(() => {
  const stage = document.querySelector('[data-stage]');
  if (!stage) return;
  const deck = stage.querySelector('.deck');
  const cards = [...deck.querySelectorAll('.pane')];
  const names = [...stage.querySelectorAll('.stage-names button')];
  const card = (id) => cards.find((c) => c.dataset.theme === id);
  const label = (id) => names.find((b) => b.dataset.theme === id)?.textContent.trim() ?? id;
  // The deck's order, front first, as the page was built.
  let order = cards.slice().sort((a, b) => Number(a.style.getPropertyValue('--i')) - Number(b.style.getPropertyValue('--i'))).map((c) => c.dataset.theme);

  function show(id, focusName) {
    if (!card(id) || order[0] === id) return;
    order = [id, ...order.filter((t) => t !== id)];
    order.forEach((t, i) => { const c = card(t); c.style.setProperty('--i', String(i)); c.classList.toggle('front', i === 0); });
    // The site's accent and the blade of its mark follow the chosen theme, on this page and the next ones.
    window.hwAccent?.(id);
    deck.setAttribute('aria-label', `The Hiltwright app: the Armory page with an example saber plugged in, shown in the ${label(id)} theme`);
    for (const b of names) { const on = b.dataset.theme === id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on) { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (focusName) b.focus(); } }
  }

  for (const c of cards) c.addEventListener('click', () => show(c.dataset.theme, false));
  names.forEach((b, i) => {
    b.addEventListener('click', () => show(b.dataset.theme, false));
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      show(names[(i + step + names.length) % names.length].dataset.theme, true);
    });
  });

  // A visitor who chose a theme before finds its window in front again.
  let saved = null;
  try { saved = localStorage.getItem('hw-theme'); } catch { /* storage is off: the first theme stays */ }
  if (saved) show(saved, false);

  // The top bar is clear over the stage and solid once the page has moved.
  const top = document.querySelector('.top');
  const stick = () => top.classList.toggle('stuck', window.scrollY > 40);
  window.addEventListener('scroll', stick, { passive: true });
  stick();
})();
