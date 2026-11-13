/* GoCat Studio filter tiles and resilient loader logo. */
(function(){
  "use strict";

  // Load the standalone logo asset directly instead of relying on an SVG
  // <use> reference to an embedded image inside the document.
  const loaderLogo = document.getElementById("gocatLoaderLogo");
  const logoFallback = document.getElementById("gocatLoaderLogoFallback");
  function showLoaderLogoFallback(){
    if (!loaderLogo || !logoFallback || logoFallback.hidden === false) return;
    loaderLogo.hidden = true;
    logoFallback.hidden = false;
  }
  if (loaderLogo) {
    loaderLogo.addEventListener("error", showLoaderLogoFallback, { once: true });
    if (loaderLogo.complete && loaderLogo.naturalWidth === 0) showLoaderLogoFallback();
  }

  const filterSelect = document.getElementById("reelFilter");
  const choices = Array.from(document.querySelectorAll("[data-editor-filter]"));
  if (filterSelect && choices.length) {
    function syncChoices(){
      choices.forEach(button => {
        const selected = button.dataset.editorFilter === filterSelect.value;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }
    choices.forEach(button => {
      button.addEventListener("click", () => {
        filterSelect.value = button.dataset.editorFilter;
        filterSelect.dispatchEvent(new Event("input", { bubbles: true }));
        syncChoices();
      });
    });
    filterSelect.addEventListener("change", syncChoices);
    syncChoices();
  }
})();
