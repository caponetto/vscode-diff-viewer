const vscode = require("vscode");

const OPEN_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const textDecoder = new TextDecoder();

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor(condition, message) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < OPEN_TIMEOUT_MS) {
    const result = await condition();
    if (result) {
      return result;
    }

    await settle(POLL_INTERVAL_MS);
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

function countDiffEntries(text) {
  return (text.match(/^diff --git /gm) || []).length;
}

async function settle(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readWorkspaceText(uri) {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return textDecoder.decode(bytes);
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

  return collapsedUri;
}

async function openRawEditor(expectedUri) {
  await vscode.commands.executeCommand("diffviewer.showRaw");

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputTextForUri(input, expectedUri);
  }, `Timed out waiting for the raw editor to open ${expectedUri.toString()}.`);
}

async function assertRawEditorMatches({ sourceUri, expectedEditorUri, expectedFileCount, requiredSnippets }) {
  const editor = vscode.window.activeTextEditor;
  expect(editor, `Expected an active text editor for ${expectedEditorUri.toString()}.`);
  expect(
    editor.document.uri.toString() === expectedEditorUri.toString(),
    `Expected raw editor URI ${expectedEditorUri.toString()}, received ${editor.document.uri.toString()}.`,
  );

  const expectedText = await readWorkspaceText(sourceUri);
  const actualText = editor.document.getText();

  expect(actualText === expectedText, `Raw editor text did not match ${sourceUri.path}.`);
  expect(
    countDiffEntries(actualText) === expectedFileCount,
    `Expected ${expectedFileCount} diff entries in ${sourceUri.path}, found ${countDiffEntries(actualText)}.`,
  );

  for (const snippet of requiredSnippets) {
    expect(actualText.includes(snippet), `Expected ${sourceUri.path} to contain: ${snippet}`);
  }
}

async function captureActiveTestState() {
  return vscode.commands.executeCommand("diffviewer._captureActiveTestState");
}

async function runActiveTestAction(action) {
  return vscode.commands.executeCommand("diffviewer._runActiveTestAction", action);
}

async function setDiffviewerConfig(key, value) {
  await vscode.workspace.getConfiguration("diffviewer").update(key, value, vscode.ConfigurationTarget.Global);
}

async function resetDiffviewerConfig(keys) {
  for (const key of keys) {
    await setDiffviewerConfig(key, undefined);
  }
}

async function waitForTestState(predicate, message) {
  return waitFor(async () => {
    try {
      const state = await captureActiveTestState();
      return state && predicate(state) ? state : undefined;
    } catch {
      return undefined;
    }
  }, message);
}

async function waitForActiveEditor(predicate, message) {
  return waitFor(() => {
    const editor = vscode.window.activeTextEditor;
    return editor && predicate(editor) ? editor : undefined;
  }, message);
}

module.exports = {
  expect,
  settle,
  waitFor,
  readWorkspaceText,
  openDiffViewer,
  openCollapsedDiffViewer,
  openRawEditor,
  assertRawEditorMatches,
  captureActiveTestState,
  runActiveTestAction,
  setDiffviewerConfig,
  resetDiffviewerConfig,
  waitForTestState,
  waitForActiveEditor,
};
