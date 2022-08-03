(function () {
  window.addEventListener("message", async (e) => {
    const { config, diffFiles, destination } = e.data;

    const targetElement = document.getElementById(destination);
    targetElement.textContent = "";

    const diff2htmlUi = new Diff2HtmlUI(targetElement, diffFiles, config);
    diff2htmlUi.draw();
  });
})();
