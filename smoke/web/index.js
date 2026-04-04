const vscode = require("vscode");

const OPEN_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const FINAL_DELAY_MS = 2_000;
const RUN_TIMEOUT_MS = 120_000;
const STANDARD_SETTLE_MS = 500;
const LARGE_SETTLE_MS = 2_000;
const textDecoder = new TextDecoder();

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

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countDiffEntries(text) {
  return (text.match(/^diff --git /gm) || []).length;
}

async function readWorkspaceText(uri) {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return textDecoder.decode(bytes);
}

async function openDiffViewer(sampleUri) {
  console.log(`[smoke] Opening Diff Viewer for ${sampleUri.path}`);
  await vscode.commands.executeCommand("vscode.openWith", sampleUri, "diffViewer");

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputCustomForUri(input, sampleUri) && input.viewType === "diffViewer";
  }, `Timed out waiting for Diff Viewer to open ${sampleUri.toString()}.`);
}

async function settle(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function openCollapsedDiffViewer(sampleUri) {
  const collapsedUri = sampleUri.with({ query: "collapsed" });

  console.log(`[smoke] Opening collapsed Diff Viewer for ${sampleUri.path}`);
  await vscode.commands.executeCommand("diffviewer.openCollapsed", sampleUri);

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputCustomForUri(input, collapsedUri) && input.viewType === "diffViewer";
  }, `Timed out waiting for collapsed Diff Viewer to open ${collapsedUri.toString()}.`);
}

async function openRawEditor(expectedUri) {
  console.log(`[smoke] Opening raw editor for ${expectedUri.path}`);
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

async function runStandardScenario({ sampleUri, expectedFileCount, requiredSnippets, settleMs = STANDARD_SETTLE_MS }) {
  console.log(`[smoke] Starting scenario for ${sampleUri.path}`);
  const collapsedUri = sampleUri.with({ query: "collapsed" });

  await openDiffViewer(sampleUri);
  await settle(settleMs);
  await openRawEditor(sampleUri);
  await assertRawEditorMatches({
    sourceUri: sampleUri,
    expectedEditorUri: sampleUri,
    expectedFileCount,
    requiredSnippets,
  });
  await openDiffViewer(sampleUri);
  await settle(settleMs);
  await openCollapsedDiffViewer(sampleUri);
  await settle(settleMs);
  await openRawEditor(collapsedUri);
  await assertRawEditorMatches({
    sourceUri: sampleUri,
    expectedEditorUri: collapsedUri,
    expectedFileCount,
    requiredSnippets,
  });
  console.log(`[smoke] Finished scenario for ${sampleUri.path}`);
}

async function run() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("Smoke test requires a workspace folder.");
  }

  const sampleUri = vscode.Uri.joinPath(workspaceFolder.uri, "sample.diff");
  const spacesUri = vscode.Uri.joinPath(workspaceFolder.uri, "spaces.patch");
  const largeUri = vscode.Uri.joinPath(workspaceFolder.uri, "large.patch");
  const hugeUri = vscode.Uri.joinPath(workspaceFolder.uri, "generated", "huge-multi-file.patch");

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Smoke test exceeded ${RUN_TIMEOUT_MS}ms.`)), RUN_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      (async () => {
        await runStandardScenario({
          sampleUri,
          expectedFileCount: 3,
          requiredSnippets: [
            "rename to src/renamed new.ts",
            "+export const enabled = true;",
            '+export const title = "sample";',
          ],
        });
        await runStandardScenario({
          sampleUri: spacesUri,
          expectedFileCount: 3,
          requiredSnippets: [
            "rename to src/renamed space new.ts",
            '+export const label = "with spaces";',
            "deleted file mode 100644",
          ],
        });
        await runStandardScenario({
          sampleUri: largeUri,
          expectedFileCount: 1,
          requiredSnippets: [
            "+++ b/src/large-file.ts",
            "-export const oldValue0 = 0;",
            "-export const oldValue119 = 119;",
          ],
          settleMs: LARGE_SETTLE_MS,
        });
        await runStandardScenario({
          sampleUri: hugeUri,
          expectedFileCount: 160,
          requiredSnippets: [
            "diff --git a/src/generated/file-0001.ts b/src/generated/file-0001.ts",
            "diff --git a/src/generated/file-0160.ts b/src/generated/file-0160.ts",
            "+export const newValue119 = 119 + 160;",
          ],
          settleMs: LARGE_SETTLE_MS,
        });

        await new Promise((resolve) => setTimeout(resolve, FINAL_DELAY_MS));
      })(),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  run,
};
