(() => {
  function headingHTML(label) {
    const safe = String(label || "")
      .replace(/☕/g, "")
      .replace(/^PIZZAS INDIVIDUAIS$/i, "PIZZAS")
      .trim();
    return (
      `<span class="r19-rule"></span>` +
      `<span class="r19-loz" aria-hidden="true"></span>` +
      `<span class="r19-kicker">${safe}</span>` +
      `<span class="r19-loz" aria-hidden="true"></span>` +
      `<span class="r19-rule"></span>`
    );
  }

  function ensureCorners(inner) {
    if (!inner || inner.querySelector(".r19-corner")) return;
    ["tl", "tr", "bl", "br"].forEach((c) => {
      const mark = document.createElement("i");
      mark.className = `r19-corner r19-c-${c}`;
      mark.setAttribute("aria-hidden", "true");
      inner.prepend(mark);
    });
  }

  function polishHeadings(page) {
    page.querySelectorAll(".menu-section h3, .menu-bottom-section h3, .r14-pizza-band h3").forEach((h3) => {
      if (h3.querySelector(".r19-kicker")) return;
      h3.classList.add("r19-heading");
      h3.innerHTML = headingHTML(h3.textContent);
    });
    const header = page.querySelector(".menu-header");
    if (header && !header.querySelector(".r19-brand-rule")) {
      const rule = document.createElement("div");
      rule.className = "r19-brand-rule";
      rule.innerHTML = '<span class="r19-rule"></span><span class="r19-loz" aria-hidden="true"></span><span class="r19-rule"></span>';
      header.append(rule);
    }
    const foot = page.querySelector(".menu-footer");
    if (foot && !foot.querySelector(".r19-footcopy")) {
      const text = foot.textContent.trim();
      foot.innerHTML =
        `<span class="r19-loz" aria-hidden="true"></span>` +
        `<span class="r19-footcopy">${text}</span>` +
        `<span class="r19-loz" aria-hidden="true"></span>`;
    }
  }

  function polish() {
    const page = document.getElementById("menuPage");
    if (!page) return;
    page.classList.add("r19");
    ensureCorners(page.querySelector(".menu-inner"));
    polishHeadings(page);
  }

  const previous = renderPage;
  renderPage = function r19WrappedRenderPage() {
    previous.apply(this, arguments);
    polish();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish, { once: true });
  } else {
    polish();
  }
})();
