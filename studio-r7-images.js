(() => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

  function imageMeta(product) {
    const fit = product?.imageFit === 'cover' ? 'cover' : 'contain';
    const x = clamp(product?.imageX ?? 50, 0, 100);
    const y = clamp(product?.imageY ?? 50, 0, 100);
    const scalePct = clamp(product?.imageScale ?? 100, 70, 160);
    return { fit, x, y, scalePct, scale: scalePct / 100 };
  }

  function styleVars(product) {
    const meta = imageMeta(product);
    return `--r7-fit:${meta.fit};--r7-x:${meta.x}%;--r7-y:${meta.y}%;--r7-scale:${meta.scale}`;
  }

  function r7ImageMarkup(product) {
    if (!product?.image) return `<span>${categoryGlyph(product?.category)}</span>`;
    return `<img class="r7-product-image" src="${escapeHtml(product.image)}" alt="" loading="lazy" style="${styleVars(product)}">`;
  }

  function r7RenderSection(category) {
    const items = activeProducts(category);
    if (!items.length || state.categories?.[category]?.active === false) return '';
    return `
      <section class="menu-section" data-category="${escapeHtml(category)}">
        <h3>${escapeHtml(categoryLabel(category))}</h3>
        <div class="menu-items">
          ${items.map((p) => {
            const meta = imageMeta(p);
            return `
              <div class="menu-item" data-product="${escapeHtml(p.id)}" data-r7-fit="${meta.fit}">
                <div class="menu-item-image r7-media-frame" style="${styleVars(p)}">${r7ImageMarkup(p)}</div>
                <div class="menu-item-name">${escapeHtml(p.name)}</div>
                <div class="menu-item-price">${escapeHtml(money(p.price))}</div>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function r7RenderBottomCards(category, target, kind) {
    const items = activeProducts(category);
    if (kind === 'beverage') {
      target.innerHTML = items.map((p) => {
        const meta = imageMeta(p);
        return `
          <div class="beverage-card" data-product="${escapeHtml(p.id)}" data-r7-fit="${meta.fit}">
            <div class="beverage-icon r7-media-frame" style="${styleVars(p)}">${p.image ? r7ImageMarkup(p) : ''}</div>
            <strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(money(p.price))}</span>
          </div>`;
      }).join('');
    } else {
      target.innerHTML = items.map((p) => {
        const meta = imageMeta(p);
        return `
          <div class="promo-card" data-product="${escapeHtml(p.id)}" data-r7-fit="${meta.fit}">
            <div class="promo-thumb r7-media-frame" style="${styleVars(p)}">${r7ImageMarkup(p)}</div>
            <strong>${escapeHtml(p.name.replace(/^Promo\s+(Manhã|Almoço|Tarde Doce)\s*·\s*/i, ''))}</strong>
            <span class="promo-price">${escapeHtml(money(p.price))}</span>
          </div>`;
      }).join('');
    }
  }

  function r7RenderSelectedImage(product) {
    if (!ui?.selectedImagePreview) return;
    ui.selectedImagePreview.style.backgroundImage = 'none';
    ui.selectedImagePreview.innerHTML = product?.image
      ? `<img class="r7-product-image" src="${escapeHtml(product.image)}" alt="" style="width:100%;height:100%;${styleVars(product)}">`
      : '<span>sem imagem</span>';
  }

  function syncControls(product) {
    const root = document.getElementById('r7ImageControls');
    if (!root || !product) return;
    const meta = imageMeta(product);
    root.querySelector('#r7Fit').value = meta.fit;
    root.querySelector('#r7X').value = meta.x;
    root.querySelector('#r7Y').value = meta.y;
    root.querySelector('#r7Scale').value = meta.scalePct;
    root.querySelector('#r7XValue').textContent = `${meta.x}%`;
    root.querySelector('#r7YValue').textContent = `${meta.y}%`;
    root.querySelector('#r7ScaleValue').textContent = `${meta.scalePct}%`;
  }

  function refreshImageOnly() {
    if (typeof renderPage === 'function') renderPage();
    if (typeof renderProductList === 'function') renderProductList();
    if (typeof renderSelectedImage === 'function') renderSelectedImage(productById());
  }

  function mountControls() {
    const imageEditor = document.querySelector('.image-editor');
    if (!imageEditor || document.getElementById('r7ImageControls')) return;

    const root = document.createElement('div');
    root.id = 'r7ImageControls';
    root.className = 'r7-image-controls';
    root.innerHTML = `
      <div class="r7-image-controls-title">
        <strong>Enquadramento da imagem</strong>
        <span>sem cortar por padrão</span>
      </div>
      <div class="r7-image-controls-grid">
        <label class="r7-wide">Modo
          <select id="r7Fit">
            <option value="contain">Encaixar inteira · recomendado</option>
            <option value="cover">Preencher o quadro · pode cortar</option>
          </select>
        </label>
        <label>Horizontal <span id="r7XValue">50%</span>
          <input id="r7X" type="range" min="0" max="100" value="50">
        </label>
        <label>Vertical <span id="r7YValue">50%</span>
          <input id="r7Y" type="range" min="0" max="100" value="50">
        </label>
        <label class="r7-wide">Escala <span id="r7ScaleValue">100%</span>
          <input id="r7Scale" type="range" min="70" max="160" value="100">
        </label>
      </div>
      <div class="r7-image-controls-actions">
        <button type="button" id="r7Safe">Encaixar sem cortar</button>
        <button type="button" id="r7Center">Centralizar</button>
      </div>
    `;
    imageEditor.appendChild(root);

    function applyFromControls() {
      const product = productById();
      if (!product) return;
      product.imageFit = root.querySelector('#r7Fit').value === 'cover' ? 'cover' : 'contain';
      product.imageX = Number(root.querySelector('#r7X').value);
      product.imageY = Number(root.querySelector('#r7Y').value);
      product.imageScale = Number(root.querySelector('#r7Scale').value);
      syncControls(product);
      refreshImageOnly();
      setStatus('Enquadramento atualizado sem alterar o arquivo original. Clique em Salvar para persistir.', 'ok');
    }

    ['r7Fit', 'r7X', 'r7Y', 'r7Scale'].forEach((id) => {
      root.querySelector(`#${id}`).addEventListener('input', applyFromControls);
      root.querySelector(`#${id}`).addEventListener('change', applyFromControls);
    });

    root.querySelector('#r7Safe').addEventListener('click', () => {
      const product = productById();
      if (!product) return;
      product.imageFit = 'contain';
      product.imageX = 50;
      product.imageY = 50;
      product.imageScale = 96;
      syncControls(product);
      refreshImageOnly();
      setStatus('Imagem ajustada para aparecer inteira, sem corte automático.', 'ok');
    });

    root.querySelector('#r7Center').addEventListener('click', () => {
      const product = productById();
      if (!product) return;
      product.imageX = 50;
      product.imageY = 50;
      product.imageScale = 100;
      syncControls(product);
      refreshImageOnly();
      setStatus('Imagem centralizada.', 'ok');
    });
  }

  function migrateSafeDefaults() {
    if (!state?.products) return;
    state.products.forEach((product) => {
      if (!product.image) return;
      if (!product.imageFit) product.imageFit = 'contain';
      if (!Number.isFinite(Number(product.imageX))) product.imageX = 50;
      if (!Number.isFinite(Number(product.imageY))) product.imageY = 50;
      if (!Number.isFinite(Number(product.imageScale))) {
        product.imageScale = String(product.image).includes('bootstrap') ? 94 : 100;
      }
    });
  }

  function install() {
    if (typeof state === 'undefined' || typeof ui === 'undefined') return setTimeout(install, 80);

    migrateSafeDefaults();

    // Replace the old center-crop renderer with R7's non-destructive renderer.
    imageMarkup = r7ImageMarkup;
    renderSection = r7RenderSection;
    renderBottomCards = r7RenderBottomCards;
    renderSelectedImage = r7RenderSelectedImage;

    mountControls();

    const oldSelectProduct = selectProduct;
    selectProduct = function(id) {
      oldSelectProduct(id);
      syncControls(productById(id));
    };

    const oldAddProduct = addProduct;
    addProduct = function() {
      oldAddProduct();
      const product = productById();
      if (product) {
        product.imageFit = 'contain';
        product.imageX = 50;
        product.imageY = 50;
        product.imageScale = 100;
      }
      syncControls(product);
    };

    renderAll();
    syncControls(productById());
    setStatus('R7 imagens: modo seguro ativo. Fotos são exibidas inteiras por padrão, sem corte central cego.', 'ok');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
