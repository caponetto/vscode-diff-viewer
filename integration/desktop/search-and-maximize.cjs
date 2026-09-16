const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const os = require("node:os");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.run = async function () {
  if (process.platform === "win32") return; // stty measures the real PTY on macOS/Linux.
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "diff-viewer-find-"));
  fs.writeFileSync(
    path.join(output, "sample.diff"),
    "diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n",
  );
  const results = [];
  let terminal;
  async function rows(label) {
    const filename = path.join(output, "terminal-size.txt");
    fs.rmSync(filename, { force: true });
    terminal.sendText(`stty size > '${filename}'`);
    for (let i = 0; i < 40; i++) {
      await wait(100);
      if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8").trim()) {
        const size = fs.readFileSync(filename, "utf8").trim().split(/\s+/).map(Number);
        results.push({ label, rows: size[0], columns: size[1] });
        return size[0];
      }
    }
    throw new Error("Terminal did not report its size");
  }
  try {
    await vscode.commands.executeCommand("workbench.action.alignPanelCenter");
    await vscode.commands.executeCommand(
      "vscode.openWith",
      vscode.Uri.file(path.join(output, "sample.diff")),
      "diffViewer",
    );
    await wait(2000);
    terminal = vscode.window.createTerminal({ name: "Diff Viewer regression", shellPath: "/bin/sh" });
    terminal.show();
    await wait(1000);
    await vscode.commands.executeCommand("diffviewer.find");
    await wait(300);
    await vscode.commands.executeCommand("diffviewer._runActiveTestAction", { kind: "find", query: "new" });
    let search = await vscode.commands.executeCommand("diffviewer._captureActiveTestState");
    assert.equal(search.findOpen, true);
    assert.equal(search.findCount, "1 / 1");
    assert.equal(search.findHighlights, 1);
    results.push({ search: "matched", count: search.findCount, highlights: search.findHighlights });
    const initial = await rows("initial");
    for (let i = 0; i < 3; i++) {
      await vscode.commands.executeCommand("workbench.action.toggleMaximizedPanel");
      await wait(1200);
      assert.ok((await rows(`maximized-${i}`)) > initial + 5, "Terminal did not stay maximized");
      await vscode.commands.executeCommand("workbench.action.toggleMaximizedPanel");
      await wait(600);
      assert.ok(Math.abs((await rows(`restored-${i}`)) - initial) <= 1, "Terminal did not restore");
    }
    await vscode.commands.executeCommand("diffviewer._runActiveTestAction", { kind: "findKey", key: "Escape" });
    const closed = await vscode.commands.executeCommand("diffviewer._captureActiveTestState");
    assert.equal(closed.findOpen, false);
    results.push({ search: "closed" });
  } finally {
    console.log("Search/terminal regression:", JSON.stringify({ vscode: vscode.version, results }));
    terminal?.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    fs.rmSync(output, { recursive: true, force: true });
  }
};
