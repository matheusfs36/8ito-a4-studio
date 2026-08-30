(() => {
  const W = {
    mounted: false,
    assets: [],
    assetSummary: null,
    assetFilter: "all",
    assetQuery: "",
    assetDialog: null,
    qaDialog: null,
    historyDialog: null,
    diffDialog: null,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function showDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function closeOnBackdrop(dialog) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  }

  function selectedProduct() {
    return typeof productById === "function" ? productById() : null;
  }

  function resetPresentation(product) {
    if (!product) return;
    product.imageFit = "contain";
    product.imageMask = "none";
    product.imageScale = 1;
    product.imageOffsetX = 0;
    product.imageOffsetY = 0;
    product.imageX = 50;
    product.imageY = 50;
  }

  function rememberCurrentImage(product) {
    if (!product?.image) return;
    product.imageHistory = Array.isArray(product.imageHistory) ? product.imageHistory : [];
    if (!product.imageHistory.includes(product.image)) product.imageHistory.push(product.image);
  }

  function mountWorkspaceActions() {
    const panel = document.getElementById("r22ProductionPanel");
    const actions = panel?.querySelector(".r22-actions");
    if (!panel || !actions || document.getElementById("r221Assets")) return false;

    document.body.classList.add("r221-workspace");
    const assets = document.createElement("button");
    assets.type = "button";
    assets.id = "r221Assets";
    assets.textContent = "Assets";
    assets.title = "Biblioteca local de imagens, sem exclusão automática";
    const qa = document.createElement("button");
    qa.type = "button";
    qa.id = "r221Qa";
    qa.textContent = "QA produção";
    qa.title = "Valida A4, imagens, preços e exports";
    const compare = document.createElement("button");
    compare.type = "button";
    compare.id = "r221CompareVersions";
    compare.textContent = "Comparar versões";
    compare.title = "Compara snapshots com o estado atual em memória";
    actions.append(assets, qa, compare);
    assets.addEventListener("click", openAssetLibrary);
    qa.addEventListener("click", openQa);
    compare.addEventListener("click", openHistoryCompare);

    // R14 tinha um segundo gerenciador de candidatos. No R22 a curadoria oficial
    // fica na galeria segura; escondemos a UI antiga para evitar duas fontes de verdade.
    document.getElementById("r14AssetManager")?.setAttribute("data-r221-legacy", "1");
    return true;
  }

  function ensureAssetDialog() {
    if (W.assetDialog) return W.assetDialog;
    const dialog = document.createElement("dialog");
    dialog.className = "r22-dialog r221-asset-dialog";
    dialog.innerHTML = `
      <div class="r22-dialog-head">
        <div><span class="eyebrow">BIBLIOTECA LOCAL</span><h2>Assets do 8ito</h2></div>
        <button type="button" data-close>×</button>
      </div>
      <div class="r221-toolbar">
        <input id="r221AssetSearch" type="search" placeholder="Buscar arquivo, pasta ou produto…" autocomplete="off">
        <div class="r221-filter-row">
          <button type="button" data-filter="all" class="is-on">Todos</button>
          <button type="button" data-filter="used">Em uso</button>
          <button type="button" data-filter="orphan">Órfãos</button>
        </div>
      </div>
      <div id="r221AssetSummary" class="r221-summary"></div>
      <div id="r221AssetList" class="r221-asset-grid"></div>
      <div class="r22-dialog-foot">
        <button type="button" id="r221ResetFrame">Reset enquadramento do produto</button>
        <button type="button" data-close>Fechar</button>
      </div>`;
    document.body.append(dialog);
    closeOnBackdrop(dialog);
    dialog.querySelector("#r221AssetSearch")?.addEventListener("input", (event) => {
      W.assetQuery = event.target.value.trim().toLowerCase();
      renderAssets();
    });
    dialog.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      W.assetFilter = button.dataset.filter;
      dialog.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("is-on", node === button));
      renderAssets();
    }));
    dialog.querySelector("#r221ResetFrame")?.addEventListener("click", () => {
      const product = selectedProduct();
      if (!product) return setStatus("Selecione um produto primeiro.", "error");
      resetPresentation(product);
      renderAll();
      setStatus("Enquadramento normalizado: contain, sem máscara, escala 1, offsets 0.", "ok");
    });
    W.assetDialog = dialog;
    return dialog;
  }

  async function openAssetLibrary() {
    const dialog = ensureAssetDialog();
    const list = dialog.querySelector("#r221AssetList");
    const summary = dialog.querySelector("#r221AssetSummary");
    list.innerHTML = `<div class="r22-loading">Indexando imagens locais…</div>`;
    summary.textContent = "";
    showDialog(dialog);
    try {
      const result = await api("/api/assets?limit=900");
      W.assets = Array.isArray(result.assets) ? result.assets : [];
      W.assetSummary = result.summary || null;
      renderAssets();
    } catch (error) {
      list.innerHTML = `<div class="r22-empty r22-bad">Falha ao ler assets: ${esc(error.message)}</div>`;
    }
  }

  function assetMatches(asset) {
    if (W.assetFilter === "used" && asset.orphan) return false;
    if (W.assetFilter === "orphan" && !asset.orphan) return false;
    if (!W.assetQuery) return true;
    const usage = (asset.usedBy || []).map((item) => item.name).join(" ");
    return `${asset.url} ${asset.group} ${usage}`.toLowerCase().includes(W.assetQuery);
  }

  function renderAssets() {
    const dialog = W.assetDialog;
    if (!dialog) return;
    const current = selectedProduct();
    const list = dialog.querySelector("#r221AssetList");
    const summary = dialog.querySelector("#r221AssetSummary");
    const visible = W.assets.filter(assetMatches);
    const totals = W.assetSummary || { total: W.assets.length, used: 0, orphan: 0 };
    summary.innerHTML = `<b>${totals.total}</b> arquivos · <b>${totals.used}</b> em uso · <b>${totals.orphan}</b> órfãos · produto selecionado: <strong>${esc(current?.name || "nenhum")}</strong>`;
    if (!visible.length) {
      list.innerHTML = `<div class="r22-empty">Nenhum asset neste filtro.</div>`;
      return;
    }
    list.innerHTML = visible.map((asset) => {
      const used = (asset.usedBy || []).map((item) => item.name).join(", ");
      const active = current && current.image === asset.url;
      return `
        <article class="r221-asset${active ? " is-active" : ""}">
          <button type="button" class="r221-asset-preview" data-preview="${esc(asset.url)}"><img src="${esc(asset.url)}" alt=""></button>
          <div class="r221-asset-copy">
            <strong title="${esc(asset.url)}">${esc(asset.name)}</strong>
            <small>${esc(asset.group)} · ${fmtBytes(asset.bytes)} · ${asset.orphan ? "órfão" : `em uso: ${esc(used)}`}</small>
          </div>
          <button type="button" data-apply="${esc(asset.url)}" ${current ? "" : "disabled"}>${active ? "ATUAL" : "Usar"}</button>
        </article>`;
    }).join("");
    list.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", () => applyAsset(button.dataset.apply)));
    list.querySelectorAll("[data-preview]").forEach((button) => button.addEventListener("click", () => previewAsset(button.dataset.preview)));
  }

  function applyAsset(url) {
    const product = selectedProduct();
    if (!product || !url) return;
    if (product.image === url) return setStatus("Este já é o asset ativo do produto.", "ok");
    if (!confirm(`Usar este asset em “${product.name}”? A troca fica apenas em memória até Salvar.`)) return;
    rememberCurrentImage(product);
    product.image = url;
    product.imageOrigin = url.includes("/generated/") ? "generated" : "local-asset";
    resetPresentation(product);
    renderAll();
    renderAssets();
    setStatus("Asset aplicado em memória. Revise o A4 e clique em Salvar para persistir.", "ok");
  }

  function previewAsset(url) {
    const dialog = document.createElement("dialog");
    dialog.className = "r22-dialog r221-preview-dialog";
    dialog.innerHTML = `<div class="r22-dialog-head"><div><span class="eyebrow">ASSET</span><h2>${esc(url.split("/").pop())}</h2></div><button type="button" data-close>×</button></div><div class="r221-preview-body"><img src="${esc(url)}" alt=""><code>${esc(url)}</code></div>`;
    document.body.append(dialog);
    closeOnBackdrop(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  function qaChecks() {
    const products = Array.isArray(state?.products) ? state.products : [];
    const active = products.filter((p) => p.active !== false);
    const missingImages = active.filter((p) => !String(p.image || "").trim());
    const invalidNames = active.filter((p) => !String(p.name || "").trim());
    const invalidPrices = active.filter((p) => !Number.isFinite(Number(p.price)) || Number(p.price) < 0);
    const presentation = active.filter((p) => {
      const fit = p.imageFit || "contain";
      const mask = p.imageMask || "none";
      const scale = Number(p.imageScale ?? 1);
      const x = Number(p.imageOffsetX ?? 0);
      const y = Number(p.imageOffsetY ?? 0);
      return fit !== "contain" || mask !== "none" || Math.abs(scale - 1) > 0.001 || Math.abs(x) > 0.001 || Math.abs(y) > 0.001;
    });
    const refs = new Map();
    active.forEach((p) => {
      if (!p.image) return;
      const list = refs.get(p.image) || [];
      list.push(p.name);
      refs.set(p.image, list);
    });
    const duplicates = [...refs.entries()].filter(([, names]) => names.length > 1);
    const page = document.getElementById("menuPage");
    const inner = page?.querySelector(".menu-inner");
    const fits = page && inner ? inner.scrollHeight <= page.clientHeight + 2 && inner.scrollWidth <= page.clientWidth + 2 : null;
    const exportsOk = Boolean(document.getElementById("printPdf") && document.getElementById("exportPng") && document.getElementById("exportJpg"));
    const engineText = document.getElementById("engineStatus")?.textContent || "";

    const checks = [
      { label: "A4 sem overflow", ok: fits === true, warn: fits === null, detail: fits === null ? "não foi possível medir" : fits ? "conteúdo dentro da página" : "há conteúdo excedendo a página" },
      { label: "Produtos ativos com imagem", ok: missingImages.length === 0, detail: missingImages.length ? missingImages.map((p) => p.name).join(", ") : `${active.length}/${active.length}` },
      { label: "Nomes válidos", ok: invalidNames.length === 0, detail: invalidNames.length ? `${invalidNames.length} item(ns) sem nome` : "OK" },
      { label: "Preços válidos", ok: invalidPrices.length === 0, detail: invalidPrices.length ? invalidPrices.map((p) => p.name).join(", ") : "OK" },
      { label: "Enquadramento padrão", ok: presentation.length === 0, warn: presentation.length > 0, detail: presentation.length ? `${presentation.length} item(ns) fora de contain/escala 1` : "contain · sem máscara · escala 1" },
      { label: "Imagens ativas independentes", ok: duplicates.length === 0, warn: duplicates.length > 0, detail: duplicates.length ? duplicates.map(([, names]) => names.join(" + ")).join("; ") : "nenhum arquivo ativo duplicado" },
      { label: "PDF / PNG / JPG presentes", ok: exportsOk, detail: exportsOk ? "3 saídas disponíveis" : "algum botão de export não foi encontrado" },
      { label: "Motores locais", ok: true, warn: /offline|falha|erro/i.test(engineText), detail: engineText || "status não disponível" },
    ];
    const blockers = checks.filter((item) => !item.ok && !item.warn).length;
    const warnings = checks.filter((item) => item.warn).length;
    return { checks, blockers, warnings, active: active.length };
  }

  function ensureQaDialog() {
    if (W.qaDialog) return W.qaDialog;
    const dialog = document.createElement("dialog");
    dialog.className = "r22-dialog r221-qa-dialog";
    dialog.innerHTML = `<div class="r22-dialog-head"><div><span class="eyebrow">PRÉ-FLIGHT</span><h2>QA de produção</h2></div><button type="button" data-close>×</button></div><div id="r221QaBody"></div><div class="r22-dialog-foot"><button type="button" id="r221QaSnapshot">Snapshot deste estado</button><button type="button" data-close>Fechar</button></div>`;
    document.body.append(dialog);
    closeOnBackdrop(dialog);
    dialog.querySelector("#r221QaSnapshot")?.addEventListener("click", async () => {
      const qa = qaChecks();
      const label = qa.blockers ? "QA com pendências" : qa.warnings ? "QA com avisos" : "QA PASS";
      try {
        const result = await api("/api/snapshot", { method: "POST", body: { project: state, name: `R22.1 ${label}`, note: `${qa.active} produtos ativos · ${qa.blockers} bloqueios · ${qa.warnings} avisos` } });
        setStatus(`Snapshot QA criado: ${result.snapshot.name}.`, "ok");
      } catch (error) {
        setStatus(`Falha ao criar snapshot QA: ${error.message}`, "error");
      }
    });
    W.qaDialog = dialog;
    return dialog;
  }

  function openQa() {
    const dialog = ensureQaDialog();
    const qa = qaChecks();
    const badge = qa.blockers ? "REVER" : qa.warnings ? "PASS COM AVISOS" : "PASS";
    const cls = qa.blockers ? "bad" : qa.warnings ? "warn" : "good";
    dialog.querySelector("#r221QaBody").innerHTML = `
      <div class="r221-qa-hero ${cls}"><strong>${badge}</strong><span>${qa.active} produtos ativos · ${qa.blockers} bloqueios · ${qa.warnings} avisos</span></div>
      <div class="r221-checks">${qa.checks.map((item) => `
        <article class="${item.warn ? "warn" : item.ok ? "ok" : "bad"}">
          <i>${item.warn ? "!" : item.ok ? "✓" : "×"}</i>
          <div><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></div>
        </article>`).join("")}</div>`;
    showDialog(dialog);
  }

  function ensureHistoryDialog() {
    if (W.historyDialog) return W.historyDialog;
    const dialog = document.createElement("dialog");
    dialog.className = "r22-dialog r221-history-dialog";
    dialog.innerHTML = `<div class="r22-dialog-head"><div><span class="eyebrow">DIFF VISUAL</span><h2>Comparar snapshots</h2></div><button type="button" data-close>×</button></div><p class="muted">A comparação usa o snapshot escolhido contra o estado atual em memória, inclusive mudanças ainda não salvas.</p><div id="r221HistoryList" class="r22-version-list"></div><div class="r22-dialog-foot"><button type="button" data-close>Fechar</button></div>`;
    document.body.append(dialog);
    closeOnBackdrop(dialog);
    W.historyDialog = dialog;
    return dialog;
  }

  async function openHistoryCompare() {
    const dialog = ensureHistoryDialog();
    const list = dialog.querySelector("#r221HistoryList");
    list.innerHTML = `<div class="r22-loading">Carregando snapshots…</div>`;
    showDialog(dialog);
    try {
      const result = await api("/api/snapshots");
      const snaps = result.snapshots || [];
      if (!snaps.length) {
        list.innerHTML = `<div class="r22-empty">Ainda não há snapshot. Crie um no painel de produção ou no QA.</div>`;
        return;
      }
      list.innerHTML = snaps.map((snap) => `
        <article class="r22-version">
          <div><strong>${esc(snap.name)}</strong><small>${fmtDate(snap.createdAt)} · ${snap.products} produtos · ${snap.images} imagens</small>${snap.note ? `<p>${esc(snap.note)}</p>` : ""}</div>
          <span class="r22-kind">${esc(snap.kind)}</span>
          <button type="button" data-diff="${esc(snap.id)}">Comparar</button>
        </article>`).join("");
      list.querySelectorAll("[data-diff]").forEach((button) => button.addEventListener("click", () => compareSnapshot(button.dataset.diff)));
    } catch (error) {
      list.innerHTML = `<div class="r22-empty r22-bad">Falha: ${esc(error.message)}</div>`;
    }
  }

  function ensureDiffDialog() {
    if (W.diffDialog) return W.diffDialog;
    const dialog = document.createElement("dialog");
    dialog.className = "r22-dialog r221-diff-dialog";
    dialog.innerHTML = `<div class="r22-dialog-head"><div><span class="eyebrow">SNAPSHOT × AGORA</span><h2>O que mudou</h2></div><button type="button" data-close>×</button></div><div id="r221DiffBody"></div><div class="r22-dialog-foot"><button type="button" data-close>Fechar</button></div>`;
    document.body.append(dialog);
    closeOnBackdrop(dialog);
    W.diffDialog = dialog;
    return dialog;
  }

  async function compareSnapshot(id) {
    setStatus("Comparando snapshot com o estado atual…", "busy");
    try {
      const result = await api("/api/snapshot/compare", { method: "POST", body: { id, project: state } });
      const diff = result.diff;
      const dialog = ensureDiffDialog();
      const rows = [
        ...diff.added.map((item) => ({ kind: "+", name: item.name, detail: "produto adicionado" })),
        ...diff.removed.map((item) => ({ kind: "−", name: item.name, detail: "produto removido" })),
        ...diff.changed.map((item) => ({ kind: "•", name: item.name, detail: item.fields.join(", ") })),
      ];
      dialog.querySelector("#r221DiffBody").innerHTML = `
        <div class="r221-diff-summary ${diff.summary.same ? "same" : "changed"}">
          <strong>${diff.summary.same ? "SEM DIFERENÇAS" : `${diff.summary.changed + diff.summary.added + diff.summary.removed} PRODUTO(S) DIFERENTES`}</strong>
          <span>+${diff.summary.added} · −${diff.summary.removed} · alterados ${diff.summary.changed}${diff.summary.documentChanged ? " · documento/estilo mudou" : ""}</span>
        </div>
        ${diff.documentChanges.length ? `<div class="r221-document-change">Documento: ${esc(diff.documentChanges.join(", "))}</div>` : ""}
        <div class="r221-diff-list">${rows.length ? rows.map((row) => `<article><i>${row.kind}</i><div><strong>${esc(row.name)}</strong><small>${esc(row.detail)}</small></div></article>`).join("") : `<div class="r22-empty">O estado atual coincide com este snapshot.</div>`}</div>`;
      showDialog(dialog);
      setStatus(diff.summary.same ? "Snapshot e estado atual são iguais." : "Comparação pronta. Nenhuma restauração foi executada.", "ok");
    } catch (error) {
      setStatus(`Falha ao comparar snapshot: ${error.message}`, "error");
    }
  }

  function hideLegacyAssetManager() {
    const legacy = document.getElementById("r14AssetManager");
    if (legacy) legacy.dataset.r221Legacy = "1";
  }

  function mount() {
    if (W.mounted) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (mountWorkspaceActions()) {
        W.mounted = true;
        hideLegacyAssetManager();
        clearInterval(timer);
      } else if (attempts > 80) {
        clearInterval(timer);
      }
    }, 75);

    const observer = new MutationObserver(() => hideLegacyAssetManager());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
