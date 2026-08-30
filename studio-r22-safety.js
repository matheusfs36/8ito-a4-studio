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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", neutralizeLegacyAutopilot, { once: true });
  else neutralizeLegacyAutopilot();
})();
