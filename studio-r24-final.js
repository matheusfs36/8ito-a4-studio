(() => {
  function applyR24() {
    const page = document.getElementById('menuPage');
    if (!page) return false;
    page.classList.remove('r24-quiet','r24-gallery','r24-classic');
    page.classList.add('r24-final');
    return true;
  }

  if (applyR24()) return;
  const observer = new MutationObserver(() => {
    if (applyR24()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
