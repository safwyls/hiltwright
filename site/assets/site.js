// Every page: the small-screen menu.
(() => {
  const btn = document.querySelector('.menu');
  const nav = document.getElementById('nav');
  if (!btn || !nav) return;
  const set = (open) => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(!nav.classList.contains('open')));
  // Escape closes the menu and hands focus back to its button.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !nav.classList.contains('open')) return;
    set(false);
    btn.focus();
  });
})();
