(() => {
  function mount() {
    if (!window.fetch || typeof api !== "function" || typeof productById !== "function") return;
    const panel = document.getElementById("aiPanel");
    if (!panel || document.getElementById("autoProduct")) return;

    const button = document.createElement("button");
    button.id = "autoProduct";
    button.className = "gold wide";
    button.textContent = "⚡ Auto criar produto · descrição + prompt + imagem";
    button.title = "Um clique: analisa referências do 8ito, descreve, refina o prompt, gera no ComfyUI e salva.";

    const help = document.createElement("p");
    help.className = "muted";
    help.textContent = "Modo automático: usa imagens já existentes como referência visual, descreve o item localmente e gera a nova foto sem exigir prompt manual.";

    const heading = panel.querySelector(".section-heading");
    if (heading) {
      heading.insertAdjacentElement("afterend", help);
      help.insertAdjacentElement("afterend", button);
    } else {
      panel.prepend(help, button);
    }

    button.addEventListener("click", async () => {
      const product = productById();
      if (!product) return;

      const original = button.textContent;
      button.disabled = true;
      button.textContent = "⚙️ Criando localmente…";
      setStatus(`Autopilot: analisando referências e criando ${product.name} localmente…`, "busy");

      try {
        const result = await api("/api/autopilot-product", {
          method: "POST",
          body: {
            product,
            brand: state.brand,
            request: ui.aiRequest.value.trim(),
          },
        });

        if (result.description && !product.description) product.description = result.description;
        product.ai = {
          ...(result.ai || {}),
          request: result.ai?.request || ui.aiRequest.value.trim(),
          lastGeneration: result.image || null,
        };
        if (result.url) product.image = result.url;

        ui.aiRequest.value = product.ai.request || "";
        ui.aiPrompt.value = product.ai.prompt || "";
        ui.aiNegative.value = product.ai.negativePrompt || "";
        renderAll();
        await saveProject();
        setStatus(`Autopilot concluído: ${product.name} recebeu descrição, prompt refinado e imagem local.`, "ok");
      } catch (error) {
        setStatus(`Autopilot falhou: ${error.message}`, "error");
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
