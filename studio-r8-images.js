(() => {
  const SEP = /assets\/uploads\/separated\//i;
  const BOOT = /assets\/uploads\/bootstrap\//i;
  const GEN = /assets\/generated\//i;

  function sourceFor(product) {
    const src = String(product?.image || '');
    if (SEP.test(src)) return 'separated';
    if (GEN.test(src)) return 'generated';
    if (BOOT.test(src)) return 'bootstrap';
    if (src) return 'custom';
    return 'none';
  }

  function presentation(product) {
    const fit = product?.imageFit === 'cover' ? 'cover' : 'contain';
    const scale = Number.isFinite(Number(product?.imageScale)) ? Number(product.imageScale) : 1;
    const x = Number.isFinite(Number(product?.imageOffsetX)) ? Number(product.imageOffsetX) : 0;
    const y = Number.isFinite(Number(product?.imageOffsetY)) ? Number(product.imageOffsetY) : 0;
    return { fit, scale: Math.max(.45, Math.min(2.5, scale)), x: Math.max(-80, Math.min(80, x)), y: Math.max(-80, Math.min(80, y)) };
  }

  function imgMarkupR8(product) {
    if (!product?.image) return `<span>${categoryGlyph(product?.category)}</span>`;
    const p = presentation(product);
    return `<img class="r8-product-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name || '')}" loading="eager" decoding="async" data-fit="${p.fit}" style="--r8-scale:${p.scale};--r8-x:${p.x}%;--r8-y:${p.y}%;object-fit:${p.fit}">`;
  }

  // Replace the old image helper globally. Existing renderSection() then uses full-image presentation.
  imageMarkup = function(product) {
    return imgMarkupR8(product);
  };

  renderBottomCards = function(category, target, kind) {
    const items = activeProducts(category);
    if (kind === 'beverage') {
      target.innerHTML = items.map((p) => `
        <div class="beverage-card" data-product="${escapeHtml(p.id)}" data-image-source="${sourceFor(p)}">
          <div class="beverage-icon">${p.image ? imgMarkupR8(p) : ''}</div>
          <strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(money(p.price))}</span>
        </div>`).join('');
    } else {
      target.innerHTML = items.map((p) => `
        <div class="promo-card" data-product="${escapeHtml(p.id)}" data-image-source="${sourceFor(p)}">
          <div class="promo-thumb">${imgMarkupR8(p)}</div>
          <strong>${escapeHtml(p.name.replace(/^Promo\s+(Manhã|Almoço|Tarde Doce)\s*·\s*/i, ''))}</strong>
          <span class="promo-price">${escapeHtml(money(p.price))}</span>
        </div>`).join('');
    }
  };

  function decorateSources() {
    if (!state?.products) return;
    const byId = new Map(state.products.map((p) => [p.id, p]));
    document.querySelectorAll('[data-product]').forEach((node) => {
      const product = byId.get(node.dataset.product);
      if (!product) return;
      node.dataset.imageSource = sourceFor(product);
      const img = node.querySelector('img');
      if (!img) return;
      const p = presentation(product);
      img.classList.add('r8-product-img');
      img.style.setProperty('--r8-scale', String(p.scale));
      img.style.setProperty('--r8-x', `${p.x}%`);
      img.style.setProperty('--r8-y', `${p.y}%`);
      img.style.objectFit = p.fit;
      img.style.objectPosition = 'center center';
      img.style.borderRadius = '0';
    });
  }

  // Product browser/editor: never crop thumbnails either.
  const baseRenderProductListR8 = renderProductList;
  renderProductList = function(...args) {
    const result = baseRenderProductListR8.apply(this, args);
    document.querySelectorAll('.product-list-item').forEach((node) => {
      const product = productById(node.dataset.id);
      const thumb = node.querySelector('.thumb');
      if (!product || !thumb) return;
      thumb.style.backgroundSize = 'contain';
      thumb.style.backgroundPosition = 'center';
      thumb.style.backgroundRepeat = 'no-repeat';
    });
    return result;
  };

  const baseRenderSelectedImageR8 = renderSelectedImage;
  renderSelectedImage = function(product) {
    const result = baseRenderSelectedImageR8(product);
    if (product?.image) {
      ui.selectedImagePreview.style.backgroundSize = 'contain';
      ui.selectedImagePreview.style.backgroundPosition = 'center';
      ui.selectedImagePreview.style.backgroundRepeat = 'no-repeat';
    }
    return result;
  };

  const baseRenderPageR8 = renderPage;
  renderPage = function(...args) {
    const result = baseRenderPageR8.apply(this, args);
    decorateSources();
    return result;
  };

  function mount() {
    decorateSources();
    if (state) renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
