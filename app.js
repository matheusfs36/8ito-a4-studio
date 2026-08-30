const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries([
  "engineStatus","saveProject","resetBase","printMode","printPdf","exportJson","categoryFilter","productList","addProduct",
  "productEditor","selectedTitle","deleteProduct","fieldName","fieldPrice","fieldCategory","fieldActive","fieldDescription","moveUp","moveDown","applyFields",
  "selectedImagePreview","imageUpload","removeImage","aiPanel","aiRequest","refinePrompt","aiPrompt","aiNegative","aiMeta","generateImage",
  "previewMeta","menuPage","menuTagline","leftMenuColumn","rightMenuColumn","beverageGrid","promoGrid","menuFooter","statusLine","productListTemplate"
].map((id) => [id, $(id)]));

let state = null;
let health = null;
let selectedId = null;

function setStatus(message, kind = "") {
  ui.statusLine.textContent = message;
  ui.statusLine.className = `status-line ${kind}`.trim();
}

async function api(path, options = {}) {
  const init = { cache: "no-store", ...options };
  if (init.body && typeof init.body !== "string") {
    init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function money(value) {
  const number = Number(value);
  return `R$ ${Number.isFinite(number) ? number.toLocaleString("pt-BR", { minimumFractionDigits: number % 1 ? 2 : 0, maximumFractionDigits: 2 }) : "0"}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "item").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function categories() {
  return (state?.categoryOrder || []).filter((key) => state.categories?.[key]);
}

function activeProducts(category) {
  return (state?.products || []).filter((p) => p.category === category && p.active !== false);
}

function productById(id = selectedId) {
  return state?.products?.find((p) => p.id === id) || null;
}

function categoryLabel(key) {
  return state?.categories?.[key]?.label || key.toUpperCase();
}

function categoryGlyph(category) {
  return ({ salgados: "◒", pizzas: "◉", doces: "◆", bebidas: "●", promocoes: "★" })[category] || "•";
}

function imageMarkup(product, className = "") {
  if (product.image) return `<img src="${escapeHtml(product.image)}" alt="">`;
  return `<span>${categoryGlyph(product.category)}</span>`;
}

function renderSection(category) {
  const items = activeProducts(category);
  if (!items.length || state.categories?.[category]?.active === false) return "";
  return `
    <section class="menu-section" data-category="${escapeHtml(category)}">
      <h3>${escapeHtml(categoryLabel(category))}</h3>
      <div class="menu-items">
        ${items.map((p) => `
          <div class="menu-item" data-product="${escapeHtml(p.id)}">
            <div class="menu-item-image">${imageMarkup(p)}</div>
            <div class="menu-item-name">${escapeHtml(p.name)}</div>
            <div class="menu-item-price">${escapeHtml(money(p.price))}</div>
          </div>`).join("")}
      </div>
    </section>`;
}

function renderBottomCards(category, target, kind) {
  const items = activeProducts(category);
  if (kind === "beverage") {
    target.innerHTML = items.map((p) => `
      <div class="beverage-card" data-product="${escapeHtml(p.id)}">
        <div class="beverage-icon">${p.image ? `<img src="${escapeHtml(p.image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : ""}</div>
        <strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(money(p.price))}</span>
      </div>`).join("");
  } else {
    target.innerHTML = items.map((p) => `
      <div class="promo-card" data-product="${escapeHtml(p.id)}">
        <div class="promo-thumb">${imageMarkup(p)}</div>
        <strong>${escapeHtml(p.name.replace(/^Promo\s+(Manhã|Almoço|Tarde Doce)\s*·\s*/i, ""))}</strong>
        <span class="promo-price">${escapeHtml(money(p.price))}</span>
      </div>`).join("");
  }
}

function renderPage() {
  if (!state) return;
  ui.menuTagline.textContent = state.brand?.tagline || "salgados, doces e café";
  ui.menuFooter.textContent = state.brand?.footer || "Feito para acolher. Criado para ficar.";
  ui.leftMenuColumn.innerHTML = renderSection("salgados") + renderSection("pizzas");
  ui.rightMenuColumn.innerHTML = renderSection("doces");
  renderBottomCards("bebidas", ui.beverageGrid, "beverage");
  renderBottomCards("promocoes", ui.promoGrid, "promo");
}

function populateCategorySelects() {
  if (!state) return;
  const options = categories().map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(categoryLabel(key))}</option>`).join("");
  const previousFilter = ui.categoryFilter.value || "all";
  ui.categoryFilter.innerHTML = `<option value="all">Todas</option>${options}`;
  ui.fieldCategory.innerHTML = options;
  ui.categoryFilter.value = categories().includes(previousFilter) ? previousFilter : "all";
}

function renderProductList() {
  if (!state) return;
  ui.productList.innerHTML = "";
  const filter = ui.categoryFilter.value || "all";
  const list = state.products.filter((p) => filter === "all" || p.category === filter);
  for (const product of list) {
    const node = ui.productListTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = product.id;
    node.classList.toggle("selected", product.id === selectedId);
    const thumb = node.querySelector(".thumb");
    if (product.image) thumb.style.backgroundImage = `url("${product.image.replaceAll('"', '%22')}")`;
    else thumb.textContent = categoryGlyph(product.category);
    node.querySelector("strong").textContent = product.name;
    node.querySelector("small").textContent = `${categoryLabel(product.category)}${product.active === false ? " · oculto" : ""}`;
    node.querySelector(".price").textContent = money(product.price);
    node.addEventListener("click", () => selectProduct(product.id));
    ui.productList.append(node);
  }
}

function renderSelectedImage(product) {
  ui.selectedImagePreview.style.backgroundImage = product?.image ? `url("${product.image.replaceAll('"', '%22')}")` : "none";
  ui.selectedImagePreview.innerHTML = product?.image ? "" : "<span>sem imagem</span>";
}

function renderEditor() {
  const product = productById();
  const visible = Boolean(product);
  ui.productEditor.hidden = !visible;
  ui.aiPanel.hidden = !visible;
  if (!product) return;

  ui.selectedTitle.textContent = product.name;
  ui.fieldName.value = product.name || "";
  ui.fieldPrice.value = Number(product.price || 0).toFixed(2);
  ui.fieldCategory.value = product.category;
  ui.fieldActive.checked = product.active !== false;
  ui.fieldDescription.value = product.description || "";
  renderSelectedImage(product);
  ui.aiRequest.value = product.ai?.request || "";
  ui.aiPrompt.value = product.ai?.prompt || "";
  ui.aiNegative.value = product.ai?.negativePrompt || "";
  const meta = product.ai;
  ui.aiMeta.textContent = meta?.engine ? `${meta.engine} · ${meta.modelHint || "modelo local"} · ${meta.width || 768}×${meta.height || 768}${meta.reasoningSummary ? ` · ${meta.reasoningSummary}` : ""}` : "Nenhum prompt refinado ainda.";
}

function renderAll() {
  populateCategorySelects();
  renderProductList();
  renderEditor();
  renderPage();
}

function selectProduct(id) {
  selectedId = id;
  renderProductList();
  renderEditor();
}

function applyEditorFields() {
  const product = productById();
  if (!product) return;
  const name = ui.fieldName.value.trim();
  const price = Number(ui.fieldPrice.value);
  if (!name) return setStatus("O produto precisa ter nome.", "error");
  if (!Number.isFinite(price) || price < 0) return setStatus("Preço inválido.", "error");
  product.name = name;
  product.price = Math.round(price * 100) / 100;
  product.category = ui.fieldCategory.value;
  product.active = ui.fieldActive.checked;
  product.description = ui.fieldDescription.value.trim();
  setStatus("Alterações aplicadas ao documento. Clique em Salvar para persistir.", "ok");
  renderAll();
}

function addProduct() {
  const filter = ui.categoryFilter.value;
  const category = filter !== "all" && categories().includes(filter) ? filter : "salgados";
  const base = `novo-${Date.now()}`;
  state.products.push({ id: base, category, name: "Novo produto", price: 0, active: true, image: "", description: "" });
  selectedId = base;
  renderAll();
  ui.fieldName.focus();
  setStatus("Novo produto criado localmente.", "ok");
}

function deleteSelected() {
  const product = productById();
  if (!product) return;
  if (!confirm(`Excluir “${product.name}” do projeto?`)) return;
  state.products = state.products.filter((p) => p.id !== product.id);
  selectedId = state.products[0]?.id || null;
  renderAll();
  setStatus("Produto removido do projeto. Salve para persistir.", "ok");
}

function moveSelected(direction) {
  const product = productById();
  if (!product) return;
  const peers = state.products.filter((p) => p.category === product.category);
  const peerIndex = peers.findIndex((p) => p.id === product.id);
  const targetPeer = peers[peerIndex + direction];
  if (!targetPeer) return;
  const a = state.products.findIndex((p) => p.id === product.id);
  const b = state.products.findIndex((p) => p.id === targetPeer.id);
  [state.products[a], state.products[b]] = [state.products[b], state.products[a]];
  renderAll();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file) {
  const product = productById();
  if (!product || !file) return;
  if (file.size > 20 * 1024 * 1024) return setStatus("Imagem maior que 20 MB.", "error");
  setStatus("Copiando imagem para a biblioteca local…", "busy");
  try {
    const dataUrl = await fileToDataUrl(file);
    const result = await api("/api/asset", { method: "POST", body: { dataUrl } });
    product.image = result.url;
    renderAll();
    setStatus("Imagem adicionada ao produto e salva como asset local.", "ok");
  } catch (error) {
    setStatus(`Falha no upload: ${error.message}`, "error");
  } finally {
    ui.imageUpload.value = "";
  }
}

async function refineCurrentPrompt() {
  const product = productById();
  if (!product) return null;
  const request = ui.aiRequest.value.trim();
  setStatus("Qwen local está transformando o pedido em um prompt técnico para o motor disponível…", "busy");
  ui.refinePrompt.disabled = true;
  try {
    const result = await api("/api/refine-image-prompt", {
      method: "POST",
      body: { product, request, brand: state.brand }
    });
    product.ai = { ...result, request };
    ui.aiPrompt.value = result.prompt || "";
    ui.aiNegative.value = result.negativePrompt || "";
    ui.aiMeta.textContent = `${result.engine} · ${result.modelHint || "modelo local"} · ${result.width}×${result.height}${result.reasoningSummary ? ` · ${result.reasoningSummary}` : ""}`;
    setStatus("Prompt refinado. Você pode editar antes de gerar.", "ok");
    return result;
  } catch (error) {
    setStatus(`Falha ao refinar prompt: ${error.message}`, "error");
    return null;
  } finally {
    ui.refinePrompt.disabled = false;
  }
}

async function generateCurrentImage() {
  const product = productById();
  if (!product) return;
  let ai = product.ai;
  const manualPrompt = ui.aiPrompt.value.trim();
  if (!manualPrompt) ai = await refineCurrentPrompt();
  if (!ai && !ui.aiPrompt.value.trim()) return;
  product.ai = {
    ...(product.ai || {}),
    request: ui.aiRequest.value.trim(),
    prompt: ui.aiPrompt.value.trim(),
    negativePrompt: ui.aiNegative.value.trim(),
  };
  setStatus("ComfyUI está gerando a imagem localmente…", "busy");
  ui.generateImage.disabled = true;
  try {
    const result = await api("/api/image", {
      method: "POST",
      body: {
        prompt: product.ai.prompt,
        negativePrompt: product.ai.negativePrompt,
        width: product.ai.width || 768,
        height: product.ai.height || 768,
      }
    });
    product.image = result.url;
    product.ai.lastGeneration = result;
    renderAll();
    setStatus(`Imagem pronta via ${result.provider}. Asset aplicado ao cardápio.`, "ok");
  } catch (error) {
    setStatus(`Geração local falhou: ${error.message}`, "error");
  } finally {
    ui.generateImage.disabled = false;
  }
}

async function saveProject() {
  if (!state) return;
  setStatus("Salvando projeto local…", "busy");
  ui.saveProject.disabled = true;
  try {
    const result = await api("/api/project", { method: "POST", body: { project: state } });
    setStatus(`Projeto salvo em ${result.path}.`, "ok");
  } catch (error) {
    setStatus(`Falha ao salvar: ${error.message}`, "error");
  } finally {
    ui.saveProject.disabled = false;
  }
}

async function resetBase() {
  if (!confirm("Recarregar a base CARDAPIO 8ITO 270826 + atualizações do Pablo? Alterações não salvas serão perdidas.")) return;
  try {
    state = await api("/api/base");
    selectedId = state.products[0]?.id || null;
    renderAll();
    setStatus("Base recarregada em memória. Salve se quiser torná-la o estado persistente.", "ok");
  } catch (error) {
    setStatus(`Falha ao recarregar base: ${error.message}`, "error");
  }
}

function exportJson() {
  if (!state) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `8ito-cardapio-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setPrintMode(mode) {
  const bleed = mode === "bleed";
  ui.menuPage.classList.toggle("print-bleed", bleed);
  $("printPageStyle").textContent = bleed ? "@page{size:216mm 303mm;margin:0}" : "@page{size:A4 portrait;margin:0}";
  ui.previewMeta.textContent = bleed ? "216 × 303 mm · A4 + sangria de 3 mm" : "210 × 297 mm · A4 vertical";
}

async function loadHealth() {
  try {
    health = await api("/api/health");
    const llm = health.ollama?.online ? `Ollama ${health.ollama.model || "online"}` : "Ollama offline";
    const comfy = health.comfyui?.online ? `ComfyUI ${health.comfyui.checkpoint || health.comfyui.workflow}` : "ComfyUI offline";
    ui.engineStatus.textContent = `${llm} · ${comfy}`;
    ui.engineStatus.title = `Ollama: ${health.ollama?.host || ""}\nComfyUI: ${health.comfyui?.host || ""}`;
  } catch (error) {
    ui.engineStatus.textContent = "motores locais indisponíveis";
  }
}

async function boot() {
  setPrintMode("a4");
  try {
    const [project] = await Promise.all([api("/api/project"), loadHealth()]);
    state = project;
    populateCategorySelects();
    selectedId = state.products?.[0]?.id || null;
    renderAll();
    setStatus("Projeto carregado. A4 é o documento canônico.", "ok");
  } catch (error) {
    setStatus(`Falha ao abrir projeto: ${error.message}`, "error");
  }
}

ui.categoryFilter.addEventListener("change", renderProductList);
ui.addProduct.addEventListener("click", addProduct);
ui.applyFields.addEventListener("click", applyEditorFields);
ui.deleteProduct.addEventListener("click", deleteSelected);
ui.moveUp.addEventListener("click", () => moveSelected(-1));
ui.moveDown.addEventListener("click", () => moveSelected(1));
ui.imageUpload.addEventListener("change", () => uploadImage(ui.imageUpload.files?.[0]));
ui.removeImage.addEventListener("click", () => {
  const product = productById();
  if (!product) return;
  product.image = "";
  renderAll();
  setStatus("Imagem removida do item. O asset original não é apagado automaticamente.", "ok");
});
ui.refinePrompt.addEventListener("click", refineCurrentPrompt);
ui.generateImage.addEventListener("click", generateCurrentImage);
ui.saveProject.addEventListener("click", saveProject);
ui.resetBase.addEventListener("click", resetBase);
ui.exportJson.addEventListener("click", exportJson);
ui.printMode.addEventListener("change", () => setPrintMode(ui.printMode.value));
ui.printPdf.addEventListener("click", () => {
  setStatus("Abrindo diálogo de impressão. Escolha ‘Salvar como PDF’ ou a impressora/gráfica configurada.", "ok");
  window.print();
});

boot();
