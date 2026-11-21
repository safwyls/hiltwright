// The home page's stage: the theme paintings as planes. Choosing a theme, by its slice or its name, brings that
// plane to the front and shows that theme in the app window. Without this script the first theme stays in front.
(() => {
  const stage = document.querySelector('[data-stage]');
  if (!stage) return;
  const planes = [...stage.querySelectorAll('.plane')];
  const names = [...stage.querySelectorAll('.stage-names button')];
  const win = stage.querySelector('.stage-win');
  const img = win.querySelector('img');
  const label = (id) => names.find((b) => b.dataset.theme === id)?.textContent.trim() ?? id;

  function show(id, focusName) {
    const front = planes.find((p) => p.dataset.theme === id);
    if (!front || front.classList.contains('front')) return;
    // The other planes keep their order and close up into slices; the chosen one comes forward, sharpening.
    let slot = 0;
    for (const p of planes) {
      const isFront = p === front;
      p.classList.toggle('front', isFront);
      p.classList.remove('racking');
      if (!isFront) p.style.setProperty('--s', String(slot++));
    }
    void front.offsetWidth; // restart the focus pull
    front.classList.add('racking');
    for (const b of names) { const on = b.dataset.theme === id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on) { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (focusName) b.focus(); } }
    // The window: fade out, change the picture, fade in when it has loaded.
    const src = `assets/themes/${id}.jpg`;
    win.classList.add('swapping');
    const next = new Image();
    next.onload = next.onerror = () => { img.src = src; img.alt = `The Hiltwright app: the Armory page with an example saber plugged in, in the ${label(id)} theme`; win.classList.remove('swapping'); };
    next.src = src;
  }

  for (const p of planes) p.addEventListener('click', () => show(p.dataset.theme, false));
  names.forEach((b, i) => {
    b.addEventListener('click', () => show(b.dataset.theme, false));
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      show(names[(i + step + names.length) % names.length].dataset.theme, true);
    });
  });
  // Have the other pictures ready, so a change is immediate.
  window.addEventListener('load', () => { for (const b of names) new Image().src = `assets/themes/${b.dataset.theme}.jpg`; });

  // The top bar is clear over the stage and solid once the page has moved.
  const top = document.querySelector('.top');
  const stick = () => top.classList.toggle('stuck', window.scrollY > 40);
  window.addEventListener('scroll', stick, { passive: true });
  stick();
})();
