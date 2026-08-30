(() => {
  const SOURCE_BOOTSTRAP = /assets\/uploads\/bootstrap\//i;
  const SOURCE_GENERATED = /assets\/generated\//i;

  function sourceFor(product) {
    const src = String(product?.image || '');
    if (SOURCE_BOOTSTRAP.test(src)) return 'bootstrap';
    if (SOURCE_GENERATED.test(src)) return 'generated';
    if (src) return 'custom';
    return 'none';
  }

  function decorateProductImages() {
    if (!state?.products) return;
    const byId = new Map(state.products.map((p) => [p.id, p]));
    document.querySelectorAll('[data-product]').forEach((node) => {
      const product = byId.get(node.dataset.product);
      if (!product) return;
      node.dataset.imageSource = sourceFor(product);
      const img = node.querySelector('img');
      if (img) {
        img.loading = 'eager';
        img.decoding = 'async';
        img.alt = product.name || '';
      }
    });
  }

  function contentCounts() {
    const salgados = activeProducts('salgados').length;
    const pizzas = activeProducts('pizzas').length;
    const doces = activeProducts('doces').length;
    const bebidas = activeProducts('bebidas').length;
    const promocoes = activeProducts('promocoes').length;
    return { salgados, pizzas, doces, bebidas, promocoes, left: salgados + pizzas, right: doces };
  }

  function setDensity() {
    const page = ui?.menuPage || document.getElementById('menuPage');
    if (!page) return;
    const counts = contentCounts();
    page.classList.toggle('r6-dense', Math.max(counts.left, counts.right) >= 8);
  }

  function fitContent() {
    const page = ui?.menuPage || document.getElementById('menuPage');
    const inner = page?.querySelector('.menu-inner');
    if (!page || !inner) return;

    page.classList.remove('r6-compact', 'r6-ultra', 'r6-overflow-warning');
    setDensity();

    requestAnimationFrame(() => {
      const overflow1 = inner.scrollHeight > inner.clientHeight + 2;
      if (overflow1) page.classList.add('r6-compact');

      requestAnimationFrame(() => {
        const overflow2 = inner.scrollHeight > inner.clientHeight + 2;
        if (overflow2) page.classList.add('r6-ultra');

        requestAnimationFrame(() => {
          const overflow3 = inner.scrollHeight > inner.clientHeight + 2;
          page.classList.toggle('r6-overflow-warning', overflow3);
          const badge = document.getElementById('r6FlowBadge');
          if (badge) {
            const mode = page.classList.contains('r6-ultra') ? 'ultra' : page.classList.contains('r6-compact') ? 'compacto' : page.classList.contains('r6-dense') ? 'denso' : 'normal';
            badge.textContent = overflow3 ? 'Auto-flow · revisar overflow' : `Auto-flow · ${mode}`;
          }
        });
      });
    });
  }

  function decorate() {
    decorateProductImages();
    fitContent();
  }

  function mountBadge() {
    const toolbar = document.querySelector('.preview-toolbar');
    if (!toolbar || document.getElementById('r6FlowBadge')) return;
    const badge = document.createElement('span');
    badge.id = 'r6FlowBadge';
    badge.className = 'r6-flow-badge';
    badge.textContent = 'Auto-flow · ativo';
    const controls = document.getElementById('r5ViewControls');
    if (controls) controls.insertAdjacentElement('beforebegin', badge);
    else toolbar.appendChild(badge);
  }

  function installRenderHook() {
    if (typeof renderPage !== 'function' || renderPage.__r6Wrapped) return;
    const baseRenderPage = renderPage;
    const wrapped = function(...args) {
      const result = baseRenderPage.apply(this, args);
      decorate();
      return result;
    };
    wrapped.__r6Wrapped = true;
    renderPage = wrapped;
  }

  function mount() {
    mountBadge();
    installRenderHook();
    decorate();

    const page = document.getElementById('menuPage');
    if (page && !page.__r6Observer) {
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          decorate();
        });
      });
      observer.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
      page.__r6Observer = observer;
    }

    window.addEventListener('resize', fitContent, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
