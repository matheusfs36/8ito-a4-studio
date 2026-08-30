(() => {
  const P = { mounted: false, dialog: null, last: null, bypass: new Set(), focus: false };

  function esc(v) {
    return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function clientChecks() {
    const page = document.getElementById("menuPage");
    const inner = page?.querySelector(".menu-inner");
    const products = Array.isArray(state?.products) ? state.products.filter((p) => p.active !== false) : [];
    const images = [...document.querySelectorAll("#menuPage img")];
    const notLoaded = images.filter((img) => !img.complete || !img.naturalWidth || !img.naturalHeight);
    const lowRes = images.filter((img) => img.complete && img.naturalWidth && Math.min(img.naturalWidth, img.naturalHeight) < 320);
    const fits = Boolean(page && inner) && inner.scrollHeight <= page.clientHeight + 2 && inner.scrollWidth <= page.clientWidth + 2;
    const ratio = page ? page.clientWidth / Math.max(1, page.clientHeight) : 0;
    const a4Ratio = 210 / 297;
    const ratioOk = page ? Math.abs(ratio - a4Ratio) < 0.025 : false;
    const buttons = ["printPdf", "exportPng", "exportJpg"].map((id) => document.getElementById(id));
    const exportsOk = buttons.every(Boolean);
    const blockers = [];
    const warnings = [];
    if (!fits) blockers.push("A4 excede a área útil");
    if (!ratioOk) blockers.push("preview não está na proporção A4 esperada");
    if (notLoaded.length) blockers.push(`${notLoaded.length} imagem(ns) não carregaram no A4`);
    if (!exportsOk) blockers.push("PDF/PNG/JPG não estão todos disponíveis");
    if (lowRes.length) warnings.push(`${lowRes.length} imagem(ns) com lado menor que 320 px`);
    return {
      ok: blockers.length === 0,
      blockers,
      warnings,
      details: { products: products.length, domImages: images.length, notLoaded: notLoaded.length, lowRes: lowRes.length, fits, ratio, ratioOk, exportsOk }
    };
  }

  async function runPreflight(show = true) {
    const client = clientChecks();
    let server;
    try {
      server = await api("/api/r222/preflight", { method: "POST", body: { project: state } });
    } catch (error) {
      server = { ok: false, blockers: [`API de pre-flight indisponível: ${error.message}`], warnings: [], counts: {} };
    }
    const blockers = [...(server.blockers || []), ...client.blockers];
    const warnings = [...(server.warnings || []), ...client.warnings];
    P.last = { ok: blockers.length === 0, blockers, warnings, client, server, at: Date.now() };
    updateChip();
    if (show) showPreflight(P.last);
    return P.last;
  }

  function ensureDialog() {
    if (P.dialog) return P.dialog;
    const d = document.createElement("dialog");
    d.className = "r22-dialog r222-preflight-dialog";
    d.innerHTML = `<div class="r22-dialog-head"><div><span class="eyebrow">EXPORT GATE R22.2</span><h2>Pré-flight de produção</h2></div><button type="button" data-close>×</button></div><div id="r222PreflightBody"></div><div class="r22-dialog-foot"><button type="button" id="r222RunAgain">Rodar novamente</button><button type="button" id="r222FreezeBaseline" class="gold">Congelar baseline</button><button type="button" data-close>Fechar</button></div>`;
    document.body.append(d);
    d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    d.querySelector("#r222RunAgain")?.addEventListener("click", () => runPreflight(true));
    d.querySelector("#r222FreezeBaseline")?.addEventListener("click", freezeBaseline);
    P.dialog = d;
    return d;
  }

  function showPreflight(result) {
    const d = ensureDialog();
    const body = d.querySelector("#r222PreflightBody");
    const status = result.ok ? (result.warnings.length ? "PASS COM AVISOS" : "PASS") : "BLOQUEADO";
    const cls = result.ok ? (result.warnings.length ? "warn" : "good") : "bad";
    const rows = [
      ...result.blockers.map((x) => ({ kind: "bad", icon: "×", text: x })),
      ...result.warnings.map((x) => ({ kind: "warn", icon: "!", text: x })),
    ];
    body.innerHTML = `<div class="r222-preflight-hero ${cls}"><strong>${status}</strong><span>${result.server?.counts?.active ?? "?"} produtos ativos · ${result.server?.counts?.images ?? "?"} imagens · A4 ${result.client.details.fits ? "OK" : "REVER"}</span></div><div class="r222-preflight-list">${rows.length ? rows.map((r) => `<article class="${r.kind}"><i>${r.icon}</i><span>${esc(r.text)}</span></article>`).join("") : `<article class="ok"><i>✓</i><span>Sem bloqueios ou avisos detectados.</span></article>`}</div><div class="r222-preflight-meta">A4 ratio: ${result.client.details.ratio.toFixed(4)} · imagens DOM: ${result.client.details.domImages} · export PDF/PNG/JPG: ${result.client.details.exportsOk ? "OK" : "REVER"}</div>`;
    d.querySelector("#r222FreezeBaseline").disabled = !result.ok;
    if (!d.open) d.showModal();
  }

  async function freezeBaseline() {
    const pf = await runPreflight(false);
    if (!pf.ok) return showPreflight(pf);
    const suggested = "R22.2 Production Baseline";
    const name = prompt("Nome da baseline:", suggested);
    if (name === null) return;
    if (!confirm("Congelar este estado como baseline versionada? Nada será alterado no cardápio; será criado um snapshot protegido.")) return;
    try {
      const result = await api("/api/baseline/freeze", { method: "POST", body: { project: state, name: name.trim() || suggested, note: `Pré-flight R22.2 PASS · ${pf.warnings.length} aviso(s)`, confirm: "FREEZE BASELINE" } });
      setStatus(`Baseline congelada: ${result.baseline.name}.`, "ok");
      P.dialog?.close();
      if (typeof refreshProductionState === "function") refreshProductionState();
    } catch (error) {
      setStatus(`Falha ao congelar baseline: ${error.message}`, "error");
    }
  }

  function updateChip() {
    let chip = document.getElementById("r222PreflightChip");
    const toolbar = document.querySelector(".preview-toolbar");
    if (!toolbar) return;
    if (!chip) {
      chip = document.createElement("button");
      chip.id = "r222PreflightChip";
      chip.type = "button";
      chip.addEventListener("click", () => runPreflight(true));
      toolbar.append(chip);
    }
    if (!P.last) {
      chip.textContent = "Pré-flight";
      chip.className = "r222-preflight-chip";
    } else {
      chip.textContent = P.last.ok ? (P.last.warnings.length ? `Pré-flight · ${P.last.warnings.length} aviso(s)` : "Pré-flight · PASS") : `Pré-flight · ${P.last.blockers.length} bloqueio(s)`;
      chip.className = `r222-preflight-chip ${P.last.ok ? (P.last.warnings.length ? "warn" : "good") : "bad"}`;
    }
  }

  function gateExports() {
    const ids = ["printPdf", "exportPng", "exportJpg"];
    document.addEventListener("click", async (event) => {
      const button = event.target.closest?.("button");
      if (!button || !ids.includes(button.id)) return;
      if (P.bypass.has(button.id)) {
        P.bypass.delete(button.id);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const pf = await runPreflight(false);
      if (!pf.ok) {
        showPreflight(pf);
        setStatus("Export bloqueado pelo pré-flight. Corrija os itens em vermelho.", "error");
        return;
      }
      if (pf.warnings.length && !confirm(`Pré-flight passou com ${pf.warnings.length} aviso(s). Continuar com o export?`)) {
        showPreflight(pf);
        return;
      }
      P.bypass.add(button.id);
      button.click();
    }, true);
  }

  function markAdvancedPanels() {
    document.getElementById("aiPanel")?.setAttribute("data-r222-advanced", "1");
    document.getElementById("r20DocPanel")?.setAttribute("data-r222-advanced", "1");
    document.querySelectorAll(".editor-panel > .panel-section").forEach((section) => {
      if (section.textContent.includes("A4 é o padrão")) section.setAttribute("data-r222-advanced", "1");
    });
  }

  function setFocus(value) {
    P.focus = Boolean(value);
    document.body.classList.toggle("r222-focus", P.focus);
    localStorage.setItem("8ito:r222-focus", P.focus ? "1" : "0");
    const btn = document.getElementById("r222Focus");
    if (btn) btn.textContent = P.focus ? "Mostrar ferramentas" : "Modo foco";
    markAdvancedPanels();
  }

  function mountActions() {
    const actions = document.querySelector("#r22ProductionPanel .r22-actions");
    if (!actions || document.getElementById("r222Preflight")) return false;
    const pre = document.createElement("button");
    pre.id = "r222Preflight";
    pre.type = "button";
    pre.textContent = "Pré-flight export";
    const base = document.createElement("button");
    base.id = "r222Baseline";
    base.type = "button";
    base.textContent = "Congelar baseline";
    const focus = document.createElement("button");
    focus.id = "r222Focus";
    focus.type = "button";
    focus.textContent = "Modo foco";
    actions.append(pre, base, focus);
    pre.addEventListener("click", () => runPreflight(true));
    base.addEventListener("click", freezeBaseline);
    focus.addEventListener("click", () => setFocus(!P.focus));
    setFocus(localStorage.getItem("8ito:r222-focus") === "1");
    return true;
  }

  function mount() {
    if (P.mounted) return;
    P.mounted = true;
    updateChip();
    gateExports();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      markAdvancedPanels();
      if (mountActions() || tries > 100) clearInterval(timer);
    }, 80);
    window.addEventListener("resize", () => { P.last = null; updateChip(); });
    setTimeout(() => runPreflight(false), 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
