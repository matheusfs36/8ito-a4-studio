(() => {
  function stripPerItemType() {
    if (!state?.textStyles) return;
    Object.keys(state.textStyles).forEach((key) => {
      if (key.startsWith("product.") || key.startsWith("category.")) {
        delete state.textStyles[key];
      }
    });
  }

  function polish() {
    const page = document.getElementById("menuPage");
    if (!page) return;
    page.classList.add("r21");
    stripPerItemType();
  }

  const previous = renderPage;
  renderPage = function r21WrappedRenderPage() {
    previous.apply(this, arguments);
    polish();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish, { once: true });
  } else {
    polish();
  }
})();
