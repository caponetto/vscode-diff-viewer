const vscode = require("vscode");

const OPEN_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const FINAL_DELAY_MS = 2_000;

async function waitFor(condition, message) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < OPEN_TIMEOUT_MS) {
    const result = await condition();
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(message);
}

function getActiveTabInput() {
  return vscode.window.tabGroups.activeTabGroup.activeTab?.input;
}

function isTabInputCustomForUri(input, expectedUri) {
  return input instanceof vscode.TabInputCustom && input.uri.toString() === expectedUri.toString();
}

function isTabInputTextForUri(input, expectedUri) {
  return input instanceof vscode.TabInputText && input.uri.toString() === expectedUri.toString();
}

async function openDiffViewer(sampleUri) {
  await vscode.commands.executeCommand("vscode.openWith", sampleUri, "diffViewer");

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputCustomForUri(input, sampleUri) && input.viewType === "diffViewer";
  }, `Timed out waiting for Diff Viewer to open ${sampleUri.toString()}.`);
}

async function openCollapsedDiffViewer(sampleUri) {
  const collapsedUri = sampleUri.with({ query: "collapsed" });

  await vscode.commands.executeCommand("diffviewer.openCollapsed", sampleUri);

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputCustomForUri(input, collapsedUri) && input.viewType === "diffViewer";
  }, `Timed out waiting for collapsed Diff Viewer to open ${collapsedUri.toString()}.`);
}

async function openRawEditor(sampleUri) {
  await vscode.commands.executeCommand("diffviewer.showRaw");

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputTextForUri(input, sampleUri);
  }, `Timed out waiting for the raw editor to open ${sampleUri.toString()}.`);
}

async function runScenario(sampleUri) {
  await openDiffViewer(sampleUri);
  await openRawEditor(sampleUri);
  await openDiffViewer(sampleUri);
  await openCollapsedDiffViewer(sampleUri);
}

async function run() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("Smoke test requires a workspace folder.");
  }

  const sampleUri = vscode.Uri.joinPath(workspaceFolder.uri, "sample.patch");
  const spacesUri = vscode.Uri.joinPath(workspaceFolder.uri, "spaces.patch");
  const largeUri = vscode.Uri.joinPath(workspaceFolder.uri, "large.patch");

  await runScenario(sampleUri);
  await runScenario(spacesUri);
  await runScenario(largeUri);

  await new Promise((resolve) => setTimeout(resolve, FINAL_DELAY_MS));
}

module.exports = {
  run,
};
