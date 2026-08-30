(() => {
  const page = document.getElementById('menuPage');
  if (!page) return;

  function apply() {
    page.classList.add('r13-menu-polish');
    const left = document.querySelectorAll('#leftMenuColumn .menu-item').length;
    const right = document.querySelectorAll('#rightMenuColumn .menu-item').length;
    const beverages = document.querySelectorAll('#beverageGrid .beverage-card').length;
    const promos = document.querySelectorAll('#promoGrid .promo-card').length;
    const maxRows = Math.max(left, right);
    page.classList.toggle('r13-dense', maxRows >= 10 || beverages > 4 || promos > 3);
    page.classList.toggle('r13-ultra', maxRows >= 12 || beverages > 5 || promos > 4);
    page.dataset.r13Rows = String(maxRows);
  }

  const watched = ['leftMenuColumn','rightMenuColumn','beverageGrid','promoGrid']
    .map(id => document.getElementById(id)).filter(Boolean);
  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  watched.forEach(node => observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['src','class']}));
  window.addEventListener('load', apply, { once:true });
  apply();
})();
