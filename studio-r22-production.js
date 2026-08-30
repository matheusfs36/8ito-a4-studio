(() => {
  const R22 = {
    mounted: false,
    state: null,
    health: null,
    dialog: null,
    compareDialog: null,
  };

  function text(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function currentCounts() {
    const products = Array.isArray(state?.products) ? state.products : [];
    return {
      products: products.length,
      images: products.filter((p) => String(p?.image || "").trim()).length,
    };
  }

  function pageFits() {
    const page = document.getElementById("menuPage");
    const inner = page?.querySelector(".menu-inner");
    if (!page || !inner) return null;
    return inner.scrollHeight <= page.clientHeight + 2 && inner.scrollWidth <= page.clientWidth + 2;
  }

  async function refreshProductionState() {
    try {
      const [prod, engine] = await Promise.all([
        api("/api/r22/state"),
        api("/api/health").catch(() => null),
      ]);
      R22.state = prod;
      R22.health = engine;
      renderProductionPanel();
    } catch (error) {
      const status = document.getElementById("r22ProdStatus");
      if (status) status.innerHTML = `<span class="r22-bad">R22 API offline</span><small>${text(error.message)}</small>`;
    }
  }

  function mountProductionPanel() {
    const aside = document.querySelector(".editor-panel");
    if (!aside || document.getElementById("r22ProductionPanel")) return;
    const panel = document.createElement("section");
    panel.id = "r22ProductionPanel";
    panel.className = "panel-section r22-production-panel";
    panel.innerHTML = `
      <div class="section-heading">
        <div><span class="eyebrow">PRODUÇÃO R22</span><h2>Estado seguro</h2></div>
        <span class="r22-lock" title="Backups automáticos antes de operações destrutivas">◆ SAFE</span>
      </div>
      <div id="r22ProdStatus" class="r22-prod-status"><span>checando…</span></div>
      <div class="r22-actions">
        <button type="button" id="r22Snapshot" class="primary">Criar snapshot</button>
        <button type="button" id="r22Versions">Versões</button>
        <button type="button" id="r22ReloadLive">Reler salvo</button>
      </div>
      <button type="button" id="r22RestoreOriginal" class="r22-restore-original">Restaurar modelo original…</button>
      <p class="muted r22-note">Refresh normal lê o projeto vivo. Restaurar modelo original é uma ação separada e cria backup automático.</p>`;

    const first = aside.querySelector(".panel-section");
    if (first) first.insertAdjacentElement("afterend", panel);
    else aside.prepend(panel);

    document.getElementById("r22Snapshot")?.addEventListener("click", createManualSnapshot);
    document.getElementById("r22Versions")?.addEventListener("click", openVersions);
    document.getElementById("r22ReloadLive")?.addEventListener("click", reloadLiveProject);
    document.getElementById("r22RestoreOriginal")?.addEventListener("click", restoreOriginalSafely);
  }

  function replaceDangerousResetButton() {
    const old = document.getElementById("resetBase");
    if (!old || old.dataset.r22Replaced) return;
    const fresh = old.cloneNode(true);
    fresh.id = "r22TopVersions";
    fresh.dataset.r22Replaced = "1";
    fresh.textContent = "Versões / restaurar";
    fresh.title = "Snapshots e restauração segura";
    old.replaceWith(fresh);
    fresh.addEventListener("click", openVersions);
  }

  function renderProductionPanel() {
    const target = document.getElementById("r22ProdStatus");
    if (!target) return;
    const counts = currentCounts();
    const latest = R22.state?.snapshots?.latest;
    const fit = pageFits();
    const comfy = R22.health?.comfyui?.online ?? R22.health?.comfyui?.has2DCheckpoint;
    const ollama = Boolean(R22.health?.ollama?.online ?? R22.health?.ollama?.model);
    target.innerHTML = `
      <div><b>${counts.products}</b><span>produtos</span></div>
      <div><b>${counts.images}</b><span>imagens</span></div>
      <div><b class="${fit === false ? "r22-bad" : ""}">${fit === null ? "—" : fit ? "OK" : "REVER"}</b><span>A4</span></div>
      <div><b>${R22.state?.snapshots?.count ?? "—"}</b><span>snapshots</span></div>
      <div class="r22-wide"><span>Último snapshot</span><b>${latest ? text(latest.name) : "nenhum"}</b><small>${latest ? fmtDate(latest.createdAt) : ""}</small></div>
      <div class="r22-engine"><i class="${ollama ? "on" : ""}"></i> Ollama</div>
      <div class="r22-engine"><i class="${comfy ? "on" : ""}"></i> ComfyUI</div>`;
  }

  async function createManualSnapshot() {
    if (!state) return;
    const suggested = `R22 snapshot ${new Date().toLocaleString("pt-BR")}`;
    const name = prompt("Nome do snapshot:", suggested);
    if (name === null) return;
    const note = prompt("Observação opcional:", "") ?? "";
    setStatus("Criando snapshot seguro…", "busy");
    try {
      const result = await api("/api/snapshot", { method: "POST", body: { project: state, name: name.trim() || suggested, note } });
      setStatus(`Snapshot criado: ${result.snapshot.name}.`, "ok");
      await refreshProductionState();
    } catch (error) {
      setStatus(`Falha ao criar snapshot: ${error.message}`, "error");
    }
  }

  function ensureVersionsDialog() {
    if (R22.dialog) return R22.dialog;
    const dialog = document.createElement("dialog");
    dialog.id = "r22VersionsDialog";
    dialog.className = "r22-dialog";
    dialog.innerHTML = `
      <div class="r22-dialog-head"><div><span class="eyebrow">HISTÓRICO</span><h2>Versões do cardápio</h2></div><button type="button" data-close>×</button></div>
      <p class="muted">Restaurar um snapshot cria antes um backup automático do estado atual.</p>
      <div id="r22VersionList" class="r22-version-list"></div>
      <div class="r22-dialog-foot"><button type="button" data-close>Fechar</button></div>`;
    document.body.append(dialog);
    dialog.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    R22.dialog = dialog;
    return dialog;
  }

  async function openVersions() {
    const dialog = ensureVersionsDialog();
    const list = dialog.querySelector("#r22VersionList");
    list.innerHTML = `<div class="r22-loading">Carregando snapshots…</div>`;
    dialog.showModal();
    try {
      const result = await api("/api/snapshots");
      const snapshots = result.snapshots || [];
      if (!snapshots.length) {
        list.innerHTML = `<div class="r22-empty">Nenhum snapshot ainda. Crie o primeiro antes de uma rodada importante.</div>`;
        return;
      }
      list.innerHTML = snapshots.map((snap) => `
        <article class="r22-version" data-id="${text(snap.id)}">
          <div><strong>${text(snap.name)}</strong><small>${fmtDate(snap.createdAt)} · ${snap.products ?? "?"} produtos · ${snap.images ?? "?"} imagens</small>${snap.note ? `<p>${text(snap.note)}</p>` : ""}</div>
          <span class="r22-kind">${text(snap.kind)}</span>
          <button type="button" data-restore="${text(snap.id)}">Restaurar</button>
        </article>`).join("");
      list.querySelectorAll("[data-restore]").forEach((button) => {
        button.addEventListener("click", () => restoreSnapshot(button.dataset.restore));
      });
    } catch (error) {
      list.innerHTML = `<div class="r22-empty r22-bad">Falha: ${text(error.message)}</div>`;
    }
  }

  async function restoreSnapshot(id) {
    const ok = confirm("Restaurar este snapshot? O estado atual será salvo automaticamente antes da restauração.");
    if (!ok) return;
    setStatus("Criando backup e restaurando snapshot…", "busy");
    try {
      const result = await api("/api/snapshot/restore", { method: "POST", body: { id, confirm: "RESTORE" } });
      state = result.project;
      if (!productById(selectedId)) selectedId = state.products?.[0]?.id || null;
      renderAll();
      R22.dialog?.close();
      setStatus(`Snapshot restaurado. Backup automático: ${result.backup?.name || "criado"}.`, "ok");
      await refreshProductionState();
    } catch (error) {
      setStatus(`Falha ao restaurar snapshot: ${error.message}`, "error");
    }
  }

  async function reloadLiveProject() {
    if (!confirm("Reler o projeto salvo no disco? Alterações em memória que ainda não foram salvas serão descartadas.")) return;
    try {
      state = await api("/api/project");
      if (!productById(selectedId)) selectedId = state.products?.[0]?.id || null;
      renderAll();
      setStatus("Projeto salvo relido. Nenhuma restauração de base foi executada.", "ok");
      await refreshProductionState();
    } catch (error) {
      setStatus(`Falha ao reler projeto: ${error.message}`, "error");
    }
  }

  async function restoreOriginalSafely() {
    const warning = "Restaurar o MODELO ORIGINAL pode remover referências às fotos locais desta composição. Um snapshot automático será criado antes.\n\nCarregar o modelo original apenas EM MEMÓRIA agora?";
    if (!confirm(warning)) return;
    if (!confirm("Confirma uma segunda vez? Nada será persistido até você clicar em Salvar.")) return;
    setStatus("Criando backup antes de carregar o modelo original…", "busy");
    try {
      const result = await api("/api/restore-original", {
        method: "POST",
        body: { confirm: "RESTAURAR MODELO ORIGINAL", persist: false },
      });
      state = result.project;
      selectedId = state.products?.[0]?.id || null;
      renderAll();
      setStatus("Modelo original carregado apenas em memória. Backup criado. Clique em Salvar SOMENTE se quiser substituir o projeto vivo.", "error");
      await refreshProductionState();
    } catch (error) {
      setStatus(`Restauração cancelada/falhou: ${error.message}`, "error");
    }
  }

  function candidateStore(product) {
    product.ai = product.ai || {};
    product.ai.candidatesR22 = Array.isArray(product.ai.candidatesR22) ? product.ai.candidatesR22 : [];
    return product.ai.candidatesR22;
  }

  function renderCandidatePanel() {
    const host = document.getElementById("r22CandidateGallery");
    if (!host) return;
    const product = productById();
    if (!product) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const candidates = candidateStore(product);
    const active = String(product.image || "");
    host.innerHTML = `
      <div class="r22-gallery-head"><div><span class="eyebrow">CURADORIA HUMANA</span><h3>Candidatos</h3></div><small>${candidates.length} guardados</small></div>
      <p class="muted">Gerar não altera o A4. Só “Usar esta” muda a imagem ativa, e ainda exige Salvar.</p>
      <div class="r22-active-image">${active ? `<img src="${text(active)}" alt=""><span>ATUAL</span>` : `<div>sem imagem ativa</div>`}</div>
      <div class="r22-candidate-grid">
        ${candidates.map((c, index) => `
          <article class="r22-candidate" data-index="${index}">
            <button type="button" class="r22-candidate-img" data-compare="${index}"><img src="${text(c.url)}" alt="Candidato ${index + 1}"></button>
            <div><b>#${index + 1}</b><small>${text(c.provider || "ComfyUI")}</small></div>
            <button type="button" data-use="${index}" class="gold">Usar esta</button>
          </article>`).join("")}
      </div>`;
    host.querySelectorAll("[data-use]").forEach((button) => button.addEventListener("click", () => useCandidate(Number(button.dataset.use))));
    host.querySelectorAll("[data-compare]").forEach((button) => button.addEventListener("click", () => compareCandidate(Number(button.dataset.compare))));
  }

  function mountCandidatePanel() {
    const aiPanel = document.getElementById("aiPanel");
    if (!aiPanel || document.getElementById("r22CandidateGallery")) return;
    const host = document.createElement("div");
    host.id = "r22CandidateGallery";
    host.className = "r22-candidate-gallery";
    aiPanel.append(host);

    const oldGenerate = document.getElementById("generateImage");
    if (oldGenerate) {
      const fresh = oldGenerate.cloneNode(true);
      fresh.id = "r22GenerateCandidates";
      fresh.textContent = "2 · Gerar 4 candidatos";
      fresh.title = "Gera alternativas sem alterar a imagem ativa";
      oldGenerate.replaceWith(fresh);
      fresh.addEventListener("click", generateFourCandidates);
    }
    renderCandidatePanel();
  }

  async function generateFourCandidates() {
    const product = productById();
    if (!product) return;
    const button = document.getElementById("r22GenerateCandidates");
    const request = document.getElementById("aiRequest")?.value?.trim() || product.ai?.request || "";
    button.disabled = true;
    const store = candidateStore(product);
    let made = 0;
    try {
      for (let i = 0; i < 4; i += 1) {
        setStatus(`Gerando candidato ${i + 1}/4 sem alterar o A4…`, "busy");
        try {
          const result = await api("/api/autopilot-product", {
            method: "POST",
            body: { product: { ...product, image: product.image }, request, brand: state.brand },
          });
          if (result.url) {
            store.push({
              url: result.url,
              provider: result.image?.provider || "comfyui-local",
              checkpoint: result.image?.checkpoint || "",
              seed: result.image?.seed,
              request,
              createdAt: new Date().toISOString(),
              description: result.description || "",
            });
            made += 1;
            renderCandidatePanel();
          }
        } catch (error) {
          console.warn("R22 candidate failed", error);
        }
      }
      setStatus(made ? `${made} candidatos gerados. Nenhum foi aplicado automaticamente.` : "Nenhum candidato foi gerado; imagem ativa permaneceu intacta.", made ? "ok" : "error");
    } finally {
      button.disabled = false;
    }
  }

  function useCandidate(index) {
    const product = productById();
    const candidate = product && candidateStore(product)[index];
    if (!product || !candidate) return;
    if (!confirm(`Usar o candidato #${index + 1} em “${product.name}”? A troca fica em memória até você clicar em Salvar.`)) return;
    const old = product.image;
    if (old && old !== candidate.url) {
      product.imageHistory = Array.isArray(product.imageHistory) ? product.imageHistory : [];
      if (!product.imageHistory.includes(old)) product.imageHistory.push(old);
    }
    product.image = candidate.url;
    product.imageFit = "contain";
    product.imageMask = "none";
    product.imageScale = 1;
    product.imageOffsetX = 0;
    product.imageOffsetY = 0;
    renderAll();
    renderCandidatePanel();
    setStatus("Candidato aplicado em memória. Revise o A4 e clique em Salvar para persistir.", "ok");
  }

  function ensureCompareDialog() {
    if (R22.compareDialog) return R22.compareDialog;
    const dialog = document.createElement("dialog");
    dialog.className = "r22-dialog r22-compare-dialog";
    dialog.innerHTML = `<div class="r22-dialog-head"><div><span class="eyebrow">COMPARAÇÃO</span><h2>Atual × candidato</h2></div><button type="button" data-close>×</button></div><div id="r22CompareBody"></div>`;
    document.body.append(dialog);
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    R22.compareDialog = dialog;
    return dialog;
  }

  function compareCandidate(index) {
    const product = productById();
    const candidate = product && candidateStore(product)[index];
    if (!product || !candidate) return;
    const dialog = ensureCompareDialog();
    dialog.querySelector("#r22CompareBody").innerHTML = `
      <div class="r22-compare-grid">
        <figure><div>${product.image ? `<img src="${text(product.image)}" alt="Atual">` : "sem imagem"}</div><figcaption>ATUAL</figcaption></figure>
        <figure><div><img src="${text(candidate.url)}" alt="Candidato"></div><figcaption>CANDIDATO #${index + 1}</figcaption></figure>
      </div>`;
    dialog.showModal();
  }

  function patchRenderEditor() {
    if (typeof renderEditor !== "function" || renderEditor.__r22Wrapped) return;
    const previous = renderEditor;
    const wrapped = function r22RenderEditor() {
      previous.apply(this, arguments);
      renderCandidatePanel();
      renderProductionPanel();
    };
    wrapped.__r22Wrapped = true;
    renderEditor = wrapped;
  }

  function mount() {
    if (R22.mounted) return;
    R22.mounted = true;
    replaceDangerousResetButton();
    mountProductionPanel();
    mountCandidatePanel();
    patchRenderEditor();
    refreshProductionState();
    window.addEventListener("resize", () => renderProductionPanel());
    setTimeout(renderProductionPanel, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
