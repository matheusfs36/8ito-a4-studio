(() => {
  const NEGATIVE = "text, letters, price, logo, watermark, QR code, menu card, flyer, collage, package, pedestal, display stand, 3d render, CGI, plastic food, surreal, distorted food, cropped object, close-up crop, cut off edges, duplicate product, clutter";
  const JUGGERNAUT = {
    width: 896, height: 896, steps: 34, cfg: 4.5,
    sampler: "dpmpp_2m", scheduler: "karras",
  };

  function presentation(product) {
    return {
      fit: product?.imageFit === "cover" ? "cover" : "contain",
      scale: Number.isFinite(Number(product?.imageScale)) ? Number(product.imageScale) : 1,
      x: Number.isFinite(Number(product?.imageOffsetX)) ? Number(product.imageOffsetX) : 0,
      y: Number.isFinite(Number(product?.imageOffsetY)) ? Number(product.imageOffsetY) : 0,
      mask: product?.imageMask || "none",
    };
  }

  function resetImageBaseline(product) {
    if (!product) return;
    product.imageFit = "contain";
    product.imageMask = "none";
    product.imageScale = 1;
    product.imageOffsetX = 0;
    product.imageOffsetY = 0;
    product.imageX = 50;
    product.imageY = 50;
  }

  function originLabel(product) {
    const src = String(product?.image || "");
    const origin = String(product?.imageOrigin || "");
    if (!src) return "sem imagem";
    if (origin.includes("original") || src.includes("/original/")) return "foto real · ficheiro independente";
    if (src.includes("/generated/") || origin.includes("generat")) return "gerada localmente · escolha manual";
    if (src.includes("found-r3") || src.includes("infinito-vb")) return "foto real encontrada no PC";
    return origin || "asset local";
  }

  function frameMarkup(product) {
    if (!product?.image) return `<span>${categoryGlyph(product?.category)}</span>`;
    const p = presentation(product);
    return `<img class="r8-product-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name || "")}" loading="eager" decoding="async" data-fit="${p.fit}" style="object-fit:${p.fit}">`;
  }

  function foodRow(product) {
    return `
      <div class="menu-item" data-product="${escapeHtml(product.id)}">
        <div class="menu-item-image r14-frame">${frameMarkup(product)}</div>
        <div class="menu-item-copy">
          <div class="menu-item-name">${escapeHtml(product.name)}</div>
          <span class="menu-item-leader" aria-hidden="true"></span>
          <div class="menu-item-price">${escapeHtml(money(product.price))}</div>
        </div>
      </div>`;
  }

  function renderFoodSection(category) {
    const items = activeProducts(category);
    if (!items.length || state.categories?.[category]?.active === false) return "";
    return `
      <section class="menu-section" data-category="${escapeHtml(category)}">
        <h3>${escapeHtml(categoryLabel(category))}</h3>
        <div class="menu-items">${items.map(foodRow).join("")}</div>
      </section>`;
  }

  function ensurePizzaBand() {
    let band = document.getElementById("pizzaBand");
    if (band) return band;
    const columns = document.querySelector(".menu-columns");
    if (!columns) return null;
    band = document.createElement("section");
    band.id = "pizzaBand";
    band.className = "r14-pizza-band";
    columns.insertAdjacentElement("afterend", band);
    return band;
  }

  function renderPizzas() {
    const band = ensurePizzaBand();
    if (!band) return;
    const items = activeProducts("pizzas");
    if (!items.length || state.categories?.pizzas?.active === false) {
      band.hidden = true;
      band.innerHTML = "";
      return;
    }
    band.hidden = false;
    band.innerHTML = `
      <h3>PIZZAS INDIVIDUAIS</h3>
      <div class="r14-pizza-grid">
        ${items.map((p) => `
          <div class="r14-pizza-card" data-product="${escapeHtml(p.id)}">
            <div class="r14-frame">${frameMarkup(p)}</div>
            <strong>${escapeHtml(p.name.replace(/^Pizza Individual\s+/i, ""))}</strong>
            <span>${escapeHtml(money(p.price))}</span>
          </div>`).join("")}
      </div>`;
  }

  function renderBottom() {
    const drinks = activeProducts("bebidas");
    ui.beverageGrid.innerHTML = drinks.map((p) => `
      <div class="beverage-card" data-product="${escapeHtml(p.id)}">
        <div class="beverage-icon r14-frame">${p.image ? frameMarkup(p) : ""}</div>
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(money(p.price))}</span>
      </div>`).join("");
    const promos = activeProducts("promocoes");
    ui.promoGrid.innerHTML = promos.map((p) => `
      <div class="promo-card" data-product="${escapeHtml(p.id)}">
        <div class="promo-thumb r14-frame">${frameMarkup(p)}</div>
        <div>
          <strong>${escapeHtml(p.name.replace(/^Promo\s+(Manhã|Almoço|Tarde Doce)\s*·\s*/i, ""))}</strong>
          <span class="promo-price">${escapeHtml(money(p.price))}</span>
        </div>
      </div>`).join("");
  }

  function markSelected() {
    document.querySelectorAll("[data-product]").forEach((node) => {
      node.classList.toggle("is-selected", node.dataset.product === selectedId);
    });
  }

  function fitPage() {
    const page = ui.menuPage;
    const inner = page?.querySelector(".menu-inner");
    if (!page || !inner) return;
    page.classList.remove("r14-compact", "r14-overflow");
    requestAnimationFrame(() => {
      const overflow = inner.scrollHeight > inner.clientHeight + 1;
      if (overflow) page.classList.add("r14-compact");
      requestAnimationFrame(() => {
        const still = inner.scrollHeight > inner.clientHeight + 1;
        page.classList.toggle("r14-overflow", still);
        const badge = document.getElementById("r6FlowBadge");
        if (badge) {
          badge.classList.toggle("r14-overflow-badge", still);
          badge.textContent = still ? "A4 · conteúdo excede a página" : "A4 · fluxo sem overlap";
        }
      });
    });
  }

  function r14RenderPage() {
    if (!state) return;
    ui.menuPage.classList.add("r14", "r13-menu-polish", "r15");
    ui.menuPage.classList.remove("r6-dense", "r6-compact", "r6-ultra", "r13-dense", "r13-ultra");
    ui.menuTagline.textContent = state.brand?.tagline || "salgados, doces e café";
    ui.menuFooter.textContent = state.brand?.footer || "Feito para acolher. Criado para ficar.";
    ui.leftMenuColumn.innerHTML = renderFoodSection("salgados");
    ui.rightMenuColumn.innerHTML = renderFoodSection("doces");
    renderPizzas();
    renderBottom();
    markSelected();
    fitPage();
  }

  function candidatesOf(product) {
    const list = Array.isArray(product?.candidates) ? product.candidates : [];
    return list.filter((item) => item && item.url);
  }

  function renderAssetManager() {
    const editor = document.querySelector(".image-editor");
    if (!editor) return;
    let root = document.getElementById("r14AssetManager");
    if (!root) {
      root = document.createElement("div");
      root.id = "r14AssetManager";
      root.className = "r14-asset-manager";
      editor.insertAdjacentElement("afterend", root);
    }
    const product = productById();
    if (!product) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const candidates = candidatesOf(product);
    root.innerHTML = `
      <h3>Imagens do produto</h3>
      <div class="r14-asset-origin">${escapeHtml(originLabel(product))} · contain · sem máscara · escala 1</div>
      <div class="r14-asset-actions">
        <button type="button" id="r14GenerateCandidates" class="gold">Gerar 4 candidatos</button>
        <button type="button" id="r14ResetFrame">Reset enquadramento</button>
      </div>
      <div class="r14-gallery" id="r14Gallery">
        ${candidates.map((item, index) => `
          <div class="r14-candidate${item.url === product.image ? " active" : ""}" data-url="${escapeHtml(item.url)}">
            <img src="${escapeHtml(item.url)}" alt="candidato ${index + 1}">
            <button type="button" data-use="${escapeHtml(item.url)}">Usar esta</button>
          </div>`).join("")}
      </div>
    `;
    root.querySelector("#r14GenerateCandidates")?.addEventListener("click", () => generateCandidates(product));
    root.querySelector("#r14ResetFrame")?.addEventListener("click", () => {
      resetImageBaseline(product);
      renderAll();
      setStatus("Enquadramento reposto: contain, sem máscara, escala 1, offsets 0.", "ok");
    });
    root.querySelectorAll("[data-use]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        useCandidate(product, button.getAttribute("data-use"));
      });
    });
  }

  function useCandidate(product, url) {
    if (!product || !url) return;
    product.image = url;
    product.imageOrigin = url.includes("/original/") ? "local-original" : "generated";
    resetImageBaseline(product);
    renderAll();
    setStatus("Imagem aplicada ao cardápio. Clique em Salvar para persistir.", "ok");
  }

  function productPrompt(product) {
    const pizza = product.category === "pizzas";
    const specific = pizza
      ? "ONE whole individual round pizza, complete circular crust visible, no missing slice, no lifted slice, camera slightly above, not an extreme close-up"
      : "single whole product, fully visible, centered, about 18-22 percent margin around the subject";
    return [
      product.ai?.prompt || product.imagePrompt || "",
      `Realistic cafe food photography of ${product.name}, ${specific}, dark emerald background, soft natural light, real texture, small real imperfections, no graphic elements.`,
    ].filter(Boolean).join(". ");
  }

  async function generateCandidates(product) {
    if (!product) return;
    const button = document.getElementById("r14GenerateCandidates");
    if (button) button.disabled = true;
    product.candidates = candidatesOf(product);
    try {
      for (let i = 0; i < 4; i += 1) {
        setStatus(`A gerar candidato ${i + 1}/4 para ${product.name} · Juggernaut XL v9. A imagem activa não muda.`, "busy");
        const result = await api("/api/image", {
          method: "POST",
          body: {
            ...JUGGERNAUT,
            prompt: productPrompt(product),
            negativePrompt: product.ai?.negativePrompt || product.negativePrompt || NEGATIVE,
            prefix: `r14-${product.id}`,
          },
        });
        product.candidates.push({
          url: result.url,
          origin: "generated",
          seed: result.seed,
          checkpoint: result.checkpoint,
          selected: false,
        });
        renderAssetManager();
      }
      setStatus(`4 candidatos prontos para ${product.name}. Escolha um — nada foi publicado automaticamente.`, "ok");
    } catch (error) {
      setStatus(`Geração de candidatos falhou: ${error.message}`, "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function exportRaster(mime) {
    const page = ui.menuPage;
    if (!page) return;
    setStatus("A exportar raster A4 300 dpi…", "busy");
    try {
      if (typeof html2canvas !== "function") throw new Error("html2canvas indisponível");
      page.classList.add("r14-exporting");
      const canvas = await html2canvas(page, {
        backgroundColor: "#03261f",
        scale: 2480 / Math.max(1, page.clientWidth),
        useCORS: true,
        logging: false,
        ignoreElements: (el) => {
          if (!el || el === page) return false;
          return (el.offsetWidth || 0) < 1 || (el.offsetHeight || 0) < 1;
        },
        onclone: (doc) => {
          doc.querySelectorAll("*").forEach((el) => {
            const bg = doc.defaultView.getComputedStyle(el).backgroundImage;
            if (bg && bg !== "none" && bg.includes("gradient")) {
              el.style.backgroundImage = "none";
            }
          });
        },
      });
      const url = canvas.toDataURL(mime, mime.includes("jpeg") ? 0.92 : undefined);
      const a = document.createElement("a");
      a.href = url;
      a.download = `8ito-cardapio-A4-300dpi.${mime.includes("jpeg") ? "jpg" : "png"}`;
      document.body.append(a);
      a.click();
      a.remove();
      setStatus("Export raster A4 300 dpi concluído.", "ok");
    } catch (error) {
      setStatus(`Export raster falhou (${error.message}). Use Imprimir / PDF entretanto.`, "error");
    } finally {
      page.classList.remove("r14-exporting");
    }
  }

  function mountChrome() {
    const actions = document.querySelector(".top-actions");
    if (actions && !document.getElementById("exportPng")) {
      const png = document.createElement("button");
      png.id = "exportPng";
      png.textContent = "Exportar PNG";
      const jpg = document.createElement("button");
      jpg.id = "exportJpg";
      jpg.textContent = "Exportar JPG";
      const pdf = document.getElementById("printPdf");
      pdf?.insertAdjacentElement("afterend", png);
      png.insertAdjacentElement("afterend", jpg);
      png.addEventListener("click", () => exportRaster("image/png"));
      jpg.addEventListener("click", () => exportRaster("image/jpeg"));
    }

    function retarget(id, label, handler) {
      const old = document.getElementById(id);
      if (!old || old.dataset.r14) return;
      const next = old.cloneNode(true);
      next.dataset.r14 = "1";
      next.textContent = label;
      old.replaceWith(next);
      next.addEventListener("click", handler);
      return next;
    }

    retarget("autoProduct", "Auto criar · descrição + 4 candidatos", async () => {
      const product = productById();
      const button = document.getElementById("autoProduct");
      if (!product || !button) return;
      button.disabled = true;
      try {
        if (!product.ai?.prompt) {
          setStatus("A criar descrição e prompt localmente…", "busy");
          await refineCurrentPrompt();
        }
        await generateCandidates(product);
      } finally {
        button.disabled = false;
      }
    });

    retarget("generateImage", "2 · Gerar 4 candidatos (não publica)", async () => {
      await generateCandidates(productById());
    });
  }

  function mountClicks() {
    const page = document.getElementById("menuPage");
    if (!page || page.__r14Clicks) return;
    page.__r14Clicks = true;
    page.addEventListener("click", (event) => {
      const node = event.target.closest("[data-product]");
      if (!node) return;
      selectProduct(node.dataset.product);
      markSelected();
    });
  }

  renderPage = function r14WrappedRenderPage() {
    r14RenderPage();
  };

  const baseRenderEditor = renderEditor;
  renderEditor = function r14WrappedRenderEditor() {
    const result = baseRenderEditor.apply(this, arguments);
    const product = productById();
    if (product?.image && ui.selectedImagePreview) {
      ui.selectedImagePreview.style.backgroundImage = "none";
      ui.selectedImagePreview.innerHTML = `<img src="${escapeHtml(product.image)}" alt="">`;
    }
    renderAssetManager();
    markSelected();
    return result;
  };

  const baseSelect = selectProduct;
  selectProduct = function r14Select(id) {
    const result = baseSelect.apply(this, arguments);
    markSelected();
    return result;
  };

  function mount() {
    const page = document.getElementById("menuPage");
    if (page?.__r6Observer) {
      page.__r6Observer.disconnect();
      page.__r6Observer = null;
    }
    mountChrome();
    mountClicks();
    if (state) renderAll();
    window.addEventListener("resize", fitPage, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
