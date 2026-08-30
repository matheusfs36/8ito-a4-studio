(() => {
  function applyR23() {
    const page = document.getElementById('menuPage');
    if (!page) return false;
    page.classList.add('r23');
    return true;
  }

  function mount() {
    if (applyR23()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (applyR23() || tries > 80) clearInterval(timer);
    }, 80);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
