/* GoCat Studio filter tiles and accessibility sync. */
(function(){
  "use strict";
  const filterSelect = document.getElementById("reelFilter");
  const choices = Array.from(document.querySelectorAll("[data-editor-filter]"));
  if (!filterSelect || !choices.length) return;

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
})();
