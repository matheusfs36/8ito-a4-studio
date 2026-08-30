(() => {
  const R = {
    mounted: false,
    state: null,
    busy: false,
    pdfDialogOpened: false,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortHash(value) {
    const raw = String(value || "");
    return raw ? raw.slice(0, 12) : "—";
  }

  function fmtBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function tick() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function waitForImages(root) {
    const images = [...root.querySelectorAll("img")];
    await Promise.all(images.map((img) => {
      if (img.complete && img.naturalWidth && img.naturalHeight) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Imagem não carregou: ${img.src}`)), 15000);
        img.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
        img.addEventListener("error", () => { clearTimeout(timer); reject(new Error(`Falha ao carregar imagem: ${img.src}`)); }, { once: true });
      });
    }));
  }

  function clientReleaseChecks() {
    const page = document.getElementById("menuPage");
    const inner = page?.querySelector(".menu-inner");
    const images = page ? [...page.querySelectorAll("img")] : [];
    const notLoaded = images.filter((img) => !img.complete || !img.naturalWidth || !img.naturalHeight);
    const fits = Boolean(page && inner) && inner.scrollHeight <= page.clientHeight + 2 && inner.scrollWidth <= page.clientWidth + 2;
    const ratio = page ? page.clientWidth / Math.max(1, page.clientHeight) : 0;
    const ratioOk = page ? Math.abs(ratio - (210 / 297)) < 0.025 : false;
    const blockers = [];
    if (!page || !inner) blockers.push("A4 não encontrado no DOM");
    if (!fits) blockers.push("A4 excede a área útil");
    if (!ratioOk) blockers.push("preview fora da proporção A4");
    if (notLoaded.length) blockers.push(`${notLoaded.length} imagem(ns) não carregaram`);
    if (typeof html2canvas !== "function") blockers.push("html2canvas indisponível");
    return { ok: blockers.length === 0, blockers, details: { fits, ratio, ratioOk, images: images.length, notLoaded: notLoaded.length } };
  }

  async function releasePreflight() {
    const client = clientReleaseChecks();
    let server;
    try {
      server = await api("/api/r222/preflight", { method: "POST", body: { project: state } });
    } catch (error) {
      server = { ok: false, blockers: [`Servidor de pre-flight indisponível: ${error.message}`], warnings: [] };
    }
    const blockers = [...(server.blockers || []), ...client.blockers];
    return { ok: blockers.length === 0, blockers, warnings: server.warnings || [], client, server };
  }

  async function refreshReleaseState() {
    const host = document.getElementById("r223ReleasePanel");
    if (!host) return;
    try {
      R.state = await api("/api/r223/release", { method: "POST", body: { project: state } });
      renderReleasePanel();
    } catch (error) {
      host.querySelector("#r223ReleaseStatus").innerHTML = `<span class="r223-bad">R22.3 API offline</span><small>${esc(error.message)}</small>`;
    }
  }

  function proofCard(kind, label) {
    const proof = R.state?.proofs?.latest?.[kind];
    if (!proof) return `<div class="r223-proof missing"><i>○</i><div><strong>${label}</strong><small>sem prova para este estado</small></div></div>`;
    const detail = kind === "pdf"
      ? "confirmado pelo usuário"
      : `${proof.width}×${proof.height} · ${fmtBytes(proof.bytes)} · ${shortHash(proof.sha256)}`;
    return `<div class="r223-proof ok"><i>✓</i><div><strong>${label}</strong><small>${esc(detail)}</small></div></div>`;
  }

  function renderReleasePanel() {
    const host = document.getElementById("r223ReleasePanel");
    if (!host) return;
    const ready = Boolean(R.state?.releaseReady);
    const preflightOk = Boolean(R.state?.preflight?.ok);
    const proofCount = ["png", "jpg", "pdf"].filter((kind) => R.state?.proofs?.latest?.[kind]).length;
    host.querySelector("#r223ReleaseStatus").innerHTML = `
      <div class="r223-release-hero ${ready ? "ready" : preflightOk ? "pending" : "blocked"}">
        <strong>${ready ? "PRONTO PARA CONGELAR" : preflightOk ? `${proofCount}/3 PROVAS` : "PRÉ-FLIGHT BLOQUEADO"}</strong>
        <span>estado ${shortHash(R.state?.projectHash)} · R22.3</span>
      </div>
      <div class="r223-proof-grid">
        ${proofCard("png", "PNG 300 dpi")}
        ${proofCard("jpg", "JPG 300 dpi")}
        ${proofCard("pdf", "PDF impressão")}
      </div>`;
    const freeze = host.querySelector("#r223FreezeRelease");
    if (freeze) freeze.disabled = !ready || R.busy;
    const pdf = host.querySelector("#r223ConfirmPdf");
    if (pdf) pdf.disabled = Boolean(R.state?.proofs?.latest?.pdf) || R.busy;
  }

  async function sha256Blob(blob) {
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto indisponível para SHA-256");
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  async function renderA4Canvas() {
    const page = document.getElementById("menuPage");
    if (!page) throw new Error("A4 não encontrado");
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(page);
    await tick();
    page.classList.add("r14-exporting");
    try {
      const raw = await html2canvas(page, {
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
            if (bg && bg !== "none" && bg.includes("gradient")) el.style.backgroundImage = "none";
          });
        },
      });
      const out = document.createElement("canvas");
      out.width = 2480;
      out.height = 3508;
      const ctx = out.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas 2D indisponível");
      ctx.fillStyle = "#03261f";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(raw, 0, 0, out.width, out.height);
      return out;
    } finally {
      page.classList.remove("r14-exporting");
    }
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao codificar raster")), type, quality);
    });
  }

  async function recordRasterProof(kind, blob, fileName, canvas) {
    const sha256 = await sha256Blob(blob);
    return api("/api/r223/export-proof", {
      method: "POST",
      body: {
        kind,
        project: state,
        fileName,
        width: canvas.width,
        height: canvas.height,
        bytes: blob.size,
        sha256,
      },
    });
  }

  async function exportProofRaster(kind, canvas) {
    const isJpg = kind === "jpg";
    const mime = isJpg ? "image/jpeg" : "image/png";
    const fileName = `8ito-cardapio-A4-300dpi-R22.3.${isJpg ? "jpg" : "png"}`;
    const blob = await canvasBlob(canvas, mime, isJpg ? 0.92 : undefined);
    if (blob.size < 50_000) throw new Error(`${kind.toUpperCase()} gerado pequeno demais (${blob.size} bytes)`);
    await recordRasterProof(kind, blob, fileName, canvas);
    downloadBlob(blob, fileName);
    return { kind, fileName, bytes: blob.size };
  }

  async function generateRasterProofs() {
    if (R.busy) return;
    R.busy = true;
    renderReleasePanel();
    try {
      setStatus("R22.3: validando A4 antes da prova de export…", "busy");
      const pf = await releasePreflight();
      if (!pf.ok) {
        throw new Error(`Pré-flight bloqueou: ${pf.blockers.join("; ")}`);
      }
      setStatus("R22.3: renderizando A4 2480×3508 uma única vez…", "busy");
      const canvas = await renderA4Canvas();
      if (canvas.width !== 2480 || canvas.height !== 3508) throw new Error("Raster final fora de 2480×3508");
      setStatus("R22.3: verificando PNG por bytes + SHA-256…", "busy");
      const png = await exportProofRaster("png", canvas);
      setStatus("R22.3: verificando JPG por bytes + SHA-256…", "busy");
      const jpg = await exportProofRaster("jpg", canvas);
      setStatus(`Provas raster prontas: PNG ${fmtBytes(png.bytes)} · JPG ${fmtBytes(jpg.bytes)}.`, "ok");
      await refreshReleaseState();
    } catch (error) {
      setStatus(`Prova de export falhou: ${error.message}`, "error");
    } finally {
      R.busy = false;
      renderReleasePanel();
    }
  }

  async function openPdfProof() {
    if (R.busy) return;
    const pf = await releasePreflight();
    if (!pf.ok) {
      setStatus(`PDF bloqueado: ${pf.blockers.join("; ")}`, "error");
      document.getElementById("r222Preflight")?.click();
      return;
    }
    R.pdfDialogOpened = true;
    setStatus("Diálogo de impressão será aberto. Salve como PDF A4 e inspecione o arquivo antes de confirmar.", "ok");
    document.getElementById("printPdf")?.click();
  }

  async function confirmPdfProof() {
    if (R.busy) return;
    const current = R.state?.proofs?.latest?.pdf;
    if (current) return setStatus("PDF já está confirmado para este estado.", "ok");
    const warning = R.pdfDialogOpened
      ? "Confirma que você SALVOU e INSPECIONOU o PDF A4 deste estado?"
      : "O diálogo de PDF não foi aberto por este painel nesta sessão. Confirma mesmo assim que você SALVOU e INSPECIONOU o PDF A4 deste estado?";
    if (!confirm(warning)) return;
    const fileName = prompt("Nome do PDF salvo (opcional):", "8ito-cardapio-A4-R22.3.pdf") ?? "";
    R.busy = true;
    try {
      const result = await api("/api/r223/export-proof", {
        method: "POST",
        body: {
          kind: "pdf",
          project: state,
          fileName: fileName.trim() || "8ito-cardapio-A4-R22.3.pdf",
          userConfirmed: true,
          note: "Usuário confirmou que salvou e inspecionou o PDF A4.",
        },
      });
      R.state = result.state;
      setStatus("PDF confirmado para este hash do cardápio.", "ok");
    } catch (error) {
      setStatus(`Falha ao registrar prova PDF: ${error.message}`, "error");
    } finally {
      R.busy = false;
      renderReleasePanel();
    }
  }

  async function freezeReleaseCandidate() {
    if (R.busy) return;
    await refreshReleaseState();
    if (!R.state?.releaseReady) {
      return setStatus("Release ainda não está pronta. Complete PNG, JPG e confirmação do PDF.", "error");
    }
    const suggested = "R22.3 Production Candidate";
    const name = prompt("Nome do candidato congelado:", suggested);
    if (name === null) return;
    if (!confirm("Congelar este estado como Production Candidate? O cardápio não será alterado; será criado um snapshot de release.")) return;
    R.busy = true;
    try {
      const result = await api("/api/r223/release/freeze", {
        method: "POST",
        body: {
          project: state,
          name: name.trim() || suggested,
          note: "R22.3 com PNG/JPG verificados e PDF confirmado pelo usuário.",
          confirm: "FREEZE RELEASE CANDIDATE",
        },
      });
      setStatus(`Production Candidate congelado: ${result.release.name}.`, "ok");
      if (typeof refreshProductionState === "function") refreshProductionState();
      await refreshReleaseState();
    } catch (error) {
      setStatus(`Falha ao congelar candidato: ${error.message}`, "error");
    } finally {
      R.busy = false;
      renderReleasePanel();
    }
  }

  function mountPanel() {
    const production = document.getElementById("r22ProductionPanel");
    if (!production || document.getElementById("r223ReleasePanel")) return false;
    const panel = document.createElement("div");
    panel.id = "r223ReleasePanel";
    panel.className = "r223-release-panel";
    panel.innerHTML = `
      <div class="r223-release-head">
        <div><span class="eyebrow">RELEASE R22.3</span><h3>Prova de saída</h3></div>
        <span class="r223-proof-lock">SHA-256</span>
      </div>
      <div id="r223ReleaseStatus" class="r223-release-status"><span>checando provas…</span></div>
      <div class="r223-release-actions">
        <button type="button" id="r223RasterProof" class="primary">Gerar prova PNG + JPG</button>
        <button type="button" id="r223OpenPdf">Abrir PDF</button>
        <button type="button" id="r223ConfirmPdf">Confirmar PDF salvo</button>
        <button type="button" id="r223FreezeRelease" class="gold">Congelar candidato</button>
      </div>
      <p class="muted r223-note">Raster é validado em 2480×3508 por bytes + SHA-256. PDF só conta após confirmação explícita de que foi salvo e inspecionado.</p>`;
    production.append(panel);
    panel.querySelector("#r223RasterProof")?.addEventListener("click", generateRasterProofs);
    panel.querySelector("#r223OpenPdf")?.addEventListener("click", openPdfProof);
    panel.querySelector("#r223ConfirmPdf")?.addEventListener("click", confirmPdfProof);
    panel.querySelector("#r223FreezeRelease")?.addEventListener("click", freezeReleaseCandidate);
    return true;
  }

  function mount() {
    if (R.mounted) return;
    R.mounted = true;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (mountPanel()) {
        clearInterval(timer);
        refreshReleaseState();
      } else if (tries > 120) {
        clearInterval(timer);
      }
    }, 80);
    window.addEventListener("beforeprint", () => { R.pdfDialogOpened = true; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
