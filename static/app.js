(function () {
  window.addEventListener("message", async (e) => {
    const { config, diffFiles, destination } = e.data;

    const targetElement = document.getElementById(destination);
    targetElement.textContent = "";

    const diff2htmlUi = new Diff2HtmlUI(targetElement, diffFiles, config);
    diff2htmlUi.draw();

    registerViewToggleHandlers(targetElement);
    updateFooter();
  });

  function registerViewToggleHandlers(root) {
    const viewedToggles = root.querySelectorAll(".d2h-file-collapse-input");
    for (const el of viewedToggles) {
      el.addEventListener("change", scrollHeaderIntoView);
      el.addEventListener("change", updateFooter);
    }
  }

  function scrollHeaderIntoView(e) {
    const headerEl = e.target.closest(".d2h-file-header");
    if (headerEl) {
      headerEl.scrollIntoView({ block: "nearest" });
    }
  }

  function updateFooter() {
    const footer = document.querySelector("footer");
    if (footer) {
      const allCount = document.querySelectorAll(".d2h-file-collapse-input").length;
      const viewedCount = document.querySelectorAll(".d2h-file-collapse-input:checked").length;
      footer.textContent = `viewed ${viewedCount}/${allCount}`;
    }
  }
})();
