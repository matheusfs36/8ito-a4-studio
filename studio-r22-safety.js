(() => {
  function neutralizeLegacyAutopilot() {
    const legacy = document.getElementById("autoProduct");
    if (!legacy || legacy.dataset.r22Safe) return;
    const safe = legacy.cloneNode(true);
    safe.id = "r22AutoCandidates";
    safe.dataset.r22Safe = "1";
    safe.textContent = "⚡ Gerar 4 candidatos · escolher depois";
    safe.title = "Gera alternativas locais sem publicar nem salvar automaticamente.";
    legacy.replaceWith(safe);
    safe.addEventListener("click", () => {
      const generator = document.getElementById("r22GenerateCandidates");
      if (generator) generator.click();
      else if (typeof setStatus === "function") setStatus("Gerador de candidatos R22 ainda não está disponível.", "error");
    });

    const panel = document.getElementById("aiPanel");
    const help = panel ? [...panel.querySelectorAll("p.muted")].find((p) => p.textContent.includes("Modo automático")) : null;
    if (help) help.textContent = "Modo seguro R22: gera alternativas e mantém a imagem ativa intacta até você escolher explicitamente uma candidata.";
  }

  function replacePromptRefiner() {
    const legacy = document.getElementById("refinePrompt");
    if (!legacy || legacy.dataset.r22Safe) return;
    const safe = legacy.cloneNode(true);
    safe.dataset.r22Safe = "1";
    legacy.replaceWith(safe);
    safe.addEventListener("click", async () => {
      const product = productById();
      if (!product) return;
      const request = document.getElementById("aiRequest")?.value?.trim() || "";
      const oldCandidates = Array.isArray(product.ai?.candidatesR22) ? [...product.ai.candidatesR22] : [];
      safe.disabled = true;
      setStatus("Refinando prompt localmente sem perder a galeria…", "busy");
      try {
        const result = await api("/api/refine-image-prompt", {
          method: "POST",
          body: { product, request, brand: state.brand },
        });
        product.ai = { ...result, request, candidatesR22: oldCandidates };
        const prompt = document.getElementById("aiPrompt");
        const negative = document.getElementById("aiNegative");
        const meta = document.getElementById("aiMeta");
        if (prompt) prompt.value = result.prompt || "";
        if (negative) negative.value = result.negativePrompt || "";
        if (meta) meta.textContent = `${result.engine} · ${result.modelHint || "modelo local"} · ${result.width || 768}×${result.height || 768}`;
        setStatus("Prompt refinado. Candidatos existentes preservados.", "ok");
      } catch (error) {
        setStatus(`Falha ao refinar prompt: ${error.message}`, "error");
      } finally {
        safe.disabled = false;
      }
    });
  }

  function mount() {
    neutralizeLegacyAutopilot();
    replacePromptRefiner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
