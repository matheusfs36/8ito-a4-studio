(() => {
  const COLORS = {
    gold: "#d4b06a",
    cream: "#f7f1e4",
    white: "#fffaf0",
  };
  const TRACK = { tight: "-0.02em", normal: "0.02em", wide: "0.18em" };

  let selected = null;
  let editing = false;
  let skipBlur = false;

  function ensureState() {
    if (!state) return;
    state.brand = state.brand || {};
    state.categories = state.categories || {};
    state.textStyles = state.textStyles || {};
  }

  function styleKey(el) {
    if (!el) return "";
    const kind = el.dataset.edit;
    if (kind === "category.label") return "family.category.label";
    if (kind === "product.name") return "family.product.name";
    if (kind === "product.price") return "family.product.price";
    return kind || "";
  }

  function parsePrice(text) {
    const raw = String(text || "").replace(/R\$\s*/i, "").trim();
    if (!raw) return NaN;
    if (raw.includes(",") && raw.includes(".")) {
      return Number(raw.replace(/\./g, "").replace(",", "."));
    }
    if (raw.includes(",")) return Number(raw.replace(",", "."));
    return Number(raw);
  }

  function writeBack(el) {
    ensureState();
    const kind = el.dataset.edit;
    const value = el.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (kind === "brand.name") {
      if (!value) return false;
      state.brand.name = value;
      return true;
    }
    if (kind === "brand.tagline") {
      state.brand.tagline = value;
      return true;
    }
    if (kind === "brand.footer") {
      if (!value) return false;
      state.brand.footer = value;
      return true;
    }
    if (kind === "category.label") {
      const cat = el.closest("[data-category]")?.dataset.category;
      if (!cat || !value) return false;
      state.categories[cat] = state.categories[cat] || { active: true };
      state.categories[cat].label = value;
      return true;
    }
    const product = productById(el.closest("[data-product]")?.dataset.product);
    if (!product) return false;
    if (kind === "product.name") {
      if (!value) return false;
      if (product.category === "pizzas" && !/^pizza individual\s+/i.test(value)) {
        product.name = `Pizza Individual ${value}`;
      } else if (product.category === "promocoes") {
        const prefix = product.name.match(/^(Promo\s+(?:Manhã|Almoço|Tarde Doce)\s*·\s*)/i);
        product.name = prefix ? prefix[1] + value : value;
      } else {
        product.name = value;
      }
      return true;
    }
    if (kind === "product.price") {
      const price = parsePrice(value);
      if (!Number.isFinite(price) || price < 0) {
        setStatus("Preço inválido. Use por exemplo 15 ou 15,50.", "error");
        return false;
      }
      product.price = Math.round(price * 100) / 100;
      return true;
    }
    return false;
  }

  function applyStyleTo(el) {
    const key = styleKey(el);
    const s = state?.textStyles?.[key];
    el.style.fontSize = s?.scale ? `${s.scale * 100}%` : "";
    el.style.letterSpacing = s?.tracking ? TRACK[s.tracking] || "" : "";
    el.style.color = s?.color ? COLORS[s.color] || s.color : "";
    el.style.fontWeight = s?.weight || "";
  }

  function markNode(node, kind) {
    if (!node) return;
    node.dataset.edit = kind;
    node.spellcheck = false;
  }

  function markEditables(page) {
    const logo = page.querySelector(".menu-logo");
    if (logo && state?.brand?.name) logo.textContent = state.brand.name;
    markNode(logo, "brand.name");
    markNode(page.querySelector("#menuTagline"), "brand.tagline");
    markNode(page.querySelector(".r19-footcopy") || page.querySelector("#menuFooter"), "brand.footer");

    page.querySelector(".r14-pizza-band")?.setAttribute("data-category", "pizzas");
    page.querySelector(".beverage-section")?.setAttribute("data-category", "bebidas");
    page.querySelector(".promo-section")?.setAttribute("data-category", "promocoes");

    page.querySelectorAll("[data-category] h3 .r19-kicker").forEach((el) => {
      const cat = el.closest("[data-category]")?.dataset.category;
      if (cat && state?.categories?.[cat]?.label) el.textContent = state.categories[cat].label;
      markNode(el, "category.label");
    });

    page.querySelectorAll(".menu-item[data-product] .menu-item-name").forEach((el) => markNode(el, "product.name"));
    page.querySelectorAll(".menu-item[data-product] .menu-item-price").forEach((el) => markNode(el, "product.price"));
    page.querySelectorAll(".r14-pizza-card[data-product] strong, .beverage-card[data-product] strong, .promo-card[data-product] strong").forEach((el) => markNode(el, "product.name"));
    page.querySelectorAll(".r14-pizza-card[data-product] span, .beverage-card[data-product] > span").forEach((el) => markNode(el, "product.price"));
    page.querySelectorAll(".promo-card[data-product] .promo-price").forEach((el) => markNode(el, "product.price"));

    page.querySelectorAll("[data-edit]").forEach(applyStyleTo);
  }

  function clearSelection() {
    document.querySelectorAll("#menuPage [data-edit]").forEach((el) => {
      el.classList.remove("r20-selected", "r20-editing");
      if (el.getAttribute("contenteditable")) el.removeAttribute("contenteditable");
    });
    selected = null;
    editing = false;
    const bar = document.getElementById("r20TextBar");
    if (bar) bar.hidden = true;
  }

  function selectEl(el) {
    document.querySelectorAll("#menuPage [data-edit]").forEach((node) => node.classList.remove("r20-selected"));
    selected = el;
    el.classList.add("r20-selected");
    const bar = document.getElementById("r20TextBar");
    if (bar) {
      bar.hidden = false;
      const key = styleKey(el);
      const s = state.textStyles?.[key] || {};
      bar.querySelectorAll("[data-scale]").forEach((btn) => btn.classList.toggle("is-on", Number(btn.dataset.scale) === (s.scale || 1)));
      bar.querySelectorAll("[data-color]").forEach((btn) => btn.classList.toggle("is-on", (s.color || "gold") === btn.dataset.color));
      bar.querySelectorAll("[data-track]").forEach((btn) => btn.classList.toggle("is-on", (s.tracking || "normal") === btn.dataset.track));
      const label = bar.querySelector(".r20-current");
      if (label) label.textContent = prettyKind(el.dataset.edit);
    }
    syncDocFields();
  }

  function prettyKind(kind) {
    return ({
      "brand.name": "marca",
      "brand.tagline": "subtítulo",
      "brand.footer": "rodapé",
      "category.label": "categoria",
      "product.name": "nome",
      "product.price": "preço",
    })[kind] || "texto";
  }

  function editTarget(node) {
    if (!node || !node.closest) return null;
    return (
      node.closest("[data-edit]") ||
      node.closest("h3")?.querySelector("[data-edit]") ||
      node.closest(".menu-header")?.querySelector("[data-edit]") ||
      node.closest(".menu-item-copy")?.querySelector("[data-edit='product.name']") ||
      node.closest(".r14-pizza-card, .beverage-card, .promo-card")?.querySelector("[data-edit='product.name']")
    );
  }

  function enterEdit(el) {
    if (!el) return;
    selectEl(el);
    editing = true;
    el.classList.add("r20-editing");
    el.setAttribute("contenteditable", "plaintext-only");
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    setStatus("A editar no A4. Enter confirma · Esc cancela. Salve depois.", "ok");
  }

  function finishEdit(commit) {
    const el = selected;
    if (!el || !editing) {
      editing = false;
      return;
    }
    editing = false;
    skipBlur = true;
    el.classList.remove("r20-editing");
    el.removeAttribute("contenteditable");
    window.getSelection()?.removeAllRanges();
    const ok = commit ? writeBack(el) : false;
    renderAll();
    skipBlur = false;
    if (commit && ok) setStatus("Texto atualizado no cardápio. Clique em Salvar para persistir.", "ok");
    else if (!commit) setStatus("Edição cancelada.", "ok");
  }

  function applyFamily(el) {
    const key = styleKey(el);
    document.querySelectorAll("#menuPage [data-edit]").forEach((node) => {
      if (styleKey(node) === key) applyStyleTo(node);
    });
  }

  function patchStyle(partial) {
    if (!selected) return;
    ensureState();
    const key = styleKey(selected);
    state.textStyles[key] = { ...(state.textStyles[key] || {}), ...partial };
    applyFamily(selected);
    selectEl(selected);
    setStatus("Estilo de texto aplicado. Salve para persistir.", "ok");
    window.dispatchEvent(new Event("resize"));
  }

  function syncDocFields() {
    const name = document.getElementById("r20BrandName");
    const tag = document.getElementById("r20Tagline");
    const foot = document.getElementById("r20Footer");
    if (!state || !name) return;
    if (document.activeElement === name || document.activeElement === tag || document.activeElement === foot) return;
    name.value = state.brand?.name || "";
    tag.value = state.brand?.tagline || "";
    foot.value = state.brand?.footer || "";
    categories().forEach((key) => {
      const input = document.getElementById(`r20Cat-${key}`);
      if (input && document.activeElement !== input) input.value = categoryLabel(key);
    });
  }

  function bindDocPanel() {
    const bind = (id, writer) => {
      const input = document.getElementById(id);
      if (!input || input.dataset.r20) return;
      input.dataset.r20 = "1";
      input.addEventListener("change", () => {
        writer(input.value.trim());
        renderAll();
        setStatus("Texto do documento atualizado. Clique em Salvar.", "ok");
      });
    };
    bind("r20BrandName", (v) => { if (v) state.brand.name = v; });
    bind("r20Tagline", (v) => { state.brand.tagline = v; });
    bind("r20Footer", (v) => { if (v) state.brand.footer = v; });
    categories().forEach((key) => {
      const input = document.getElementById(`r20Cat-${key}`);
      if (!input || input.dataset.r20) return;
      input.dataset.r20 = "1";
      input.addEventListener("change", () => {
        const v = input.value.trim();
        if (!v) return;
        state.categories[key].label = v;
        renderAll();
        setStatus("Título de categoria atualizado. Clique em Salvar.", "ok");
      });
    });
  }

  function mountChrome() {
    const toolbar = document.querySelector(".preview-toolbar");
    if (toolbar && !document.getElementById("r20TextBar")) {
      const bar = document.createElement("div");
      bar.id = "r20TextBar";
      bar.className = "r20-text-bar";
      bar.hidden = true;
      bar.innerHTML = `
        <span class="r20-label">Texto</span>
        <span class="r20-current">—</span>
        <button type="button" data-scale="0.9" title="Menor">A−</button>
        <button type="button" data-scale="1" title="Original">A</button>
        <button type="button" data-scale="1.14" title="Maior">A+</button>
        <button type="button" data-color="gold">Ouro</button>
        <button type="button" data-color="cream">Creme</button>
        <button type="button" data-track="tight">Estreito</button>
        <button type="button" data-track="normal">Normal</button>
        <button type="button" data-track="wide">Aberto</button>
        <button type="button" data-reset="1">Reset estilo</button>
        <span class="r20-hint">duplo clique para escrever</span>`;
      toolbar.append(bar);
      bar.addEventListener("mousedown", (event) => {
        if (event.target.closest("button")) event.preventDefault();
      });
      bar.addEventListener("click", (event) => {
        const btn = event.target.closest("button");
        if (!btn || !selected) return;
        if (btn.dataset.scale) patchStyle({ scale: Number(btn.dataset.scale) });
        if (btn.dataset.color) patchStyle({ color: btn.dataset.color });
        if (btn.dataset.track) patchStyle({ tracking: btn.dataset.track });
        if (btn.dataset.reset) {
          delete state.textStyles[styleKey(selected)];
          applyFamily(selected);
          selectEl(selected);
          setStatus("Estilo do texto reposto.", "ok");
        }
      });
    }

    const aside = document.querySelector(".editor-panel");
    if (aside && !document.getElementById("r20DocPanel")) {
      const panel = document.createElement("section");
      panel.id = "r20DocPanel";
      panel.className = "panel-section";
      panel.innerHTML = `
        <span class="eyebrow">TEXTOS DO CARDÁPIO</span>
        <h2>Editar como no Canva</h2>
        <p class="muted">Clique no A4 para selecionar. Duplo clique para escrever. A barra de tipo ajusta tamanho, cor e tracking.</p>
        <div class="r20-doc-fields">
          <label>Marca<input id="r20BrandName" type="text" autocomplete="off"></label>
          <label>Subtítulo<input id="r20Tagline" type="text" autocomplete="off"></label>
          <label>Rodapé<input id="r20Footer" type="text" autocomplete="off"></label>
          <label>Salgados<input id="r20Cat-salgados" type="text" autocomplete="off"></label>
          <label>Doces<input id="r20Cat-doces" type="text" autocomplete="off"></label>
          <label>Pizzas<input id="r20Cat-pizzas" type="text" autocomplete="off"></label>
          <label>Bebidas<input id="r20Cat-bebidas" type="text" autocomplete="off"></label>
          <label>Promoções<input id="r20Cat-promocoes" type="text" autocomplete="off"></label>
        </div>`;
      const doc = [...aside.querySelectorAll(".panel-section")].find((s) => s.textContent.includes("A4 é o padrão"));
      (doc || aside).insertAdjacentElement("beforebegin", panel);
    }
    bindDocPanel();
  }

  function bindPage() {
    const page = document.getElementById("menuPage");
    if (!page || page.__r20Text) return;
    page.__r20Text = true;

    page.addEventListener("click", (event) => {
      const el = editTarget(event.target);
      if (!el || !page.contains(el)) {
        if (!event.target.closest("#r20TextBar") && !editing) clearSelection();
        return;
      }
      event.stopPropagation();
      const productId = el.closest("[data-product]")?.dataset.product;
      if (productId && typeof selectProduct === "function") selectProduct(productId);
      if (selected === el && !editing) enterEdit(el);
      else selectEl(el);
    }, true);

    page.addEventListener("dblclick", (event) => {
      const el = editTarget(event.target);
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      enterEdit(el);
    }, true);

    page.addEventListener("keydown", (event) => {
      if (!editing || !selected) return;
      if (event.key === "Enter") {
        event.preventDefault();
        finishEdit(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finishEdit(false);
      }
    });

    page.addEventListener("blur", (event) => {
      if (!editing || event.target !== selected) return;
      if (skipBlur) return;
      finishEdit(true);
    }, true);
  }

  function afterRender() {
    const page = document.getElementById("menuPage");
    if (!page || !state) return;
    ensureState();
    mountChrome();
    markEditables(page);
    bindPage();
    bindDocPanel();
    syncDocFields();
    selected = null;
    editing = false;
    const bar = document.getElementById("r20TextBar");
    if (bar) bar.hidden = true;
  }

  const previous = renderPage;
  renderPage = function r20WrappedRenderPage() {
    previous.apply(this, arguments);
    afterRender();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { mountChrome(); afterRender(); }, { once: true });
  } else {
    mountChrome();
    afterRender();
  }
})();
