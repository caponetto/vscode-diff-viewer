(function () {
  const vscode = acquireVsCodeApi();

  // only expecting an update message
  window.addEventListener("message", async (e) => {
    const { config, diffFiles, destination, viewedFiles } = e.data;

    const targetElement = document.getElementById(destination);
    targetElement.textContent = '';

    const diff2htmlUi = new Diff2HtmlUI(targetElement, diffFiles, config);
    diff2htmlUi.draw();

    toggleViewedFiles(targetElement, viewedFiles);
    registerViewToggleHandlers(targetElement);
  });

  function toggleViewedFiles(root, viewedFiles) {
    const viewedToggles = root.querySelectorAll('.d2h-file-collapse-input');
    for (let i = 0; i < viewedToggles.length; i += 1) {
      if (viewedFiles[i]) viewedToggles[i].click();
    }
  }

  function registerViewToggleHandlers(root) {
    const viewedToggles = root.querySelectorAll('.d2h-file-collapse-input');
    for (const el of viewedToggles) {
      el.addEventListener('change', scrollHeaderIntoView);
      el.addEventListener('change', reportViewedToggle);
    }

    function reportViewedToggle(e) {
      const allToggles = root.querySelectorAll('.d2h-file-collapse-input');
      const indexOfTarget = Array.from(allToggles).indexOf(e.target);
      if (indexOfTarget !== -1) {
        reportFileViewed(indexOfTarget, e.target.checked);
      }
    }
  }

  function reportFileViewed(index, value) {
    vscode.postMessage({
      command: 'reportFileViewed',
      index,
      viewed: value,
    })
  }

  function scrollHeaderIntoView(e) {
    const headerEl = e.target.closest('.d2h-file-header');
    if (headerEl) {
      headerEl.scrollIntoView({block: 'nearest'});
    }
  }
})();
