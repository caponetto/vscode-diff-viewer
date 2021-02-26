// @ts-check
(function () {
  window.addEventListener("message", async (e) => {
    const { _type, config, diffFiles, destination } = e.data;
    const targetElement = document.getElementById(destination);
    const diff2htmlUi = new Diff2HtmlUI(targetElement, diffFiles, config);
    diff2htmlUi.draw();
  });
})();
