const vscode = require("vscode");

const OPEN_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const FINAL_DELAY_MS = 2_000;
const RUN_TIMEOUT_MS = 240_000;
const STANDARD_SETTLE_MS = 500;
const LARGE_SETTLE_MS = 2_000;
const CONFIG_KEYS = [
  "colorScheme",
  "drawFileList",
  "globalScrollbar",
  "matching",
  "outputFormat",
  "renderNothingWhenEmpty",
];
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
  console.log(`[smoke] Opening Diff Viewer for ${sampleUri.path}`);
  await vscode.commands.executeCommand("vscode.openWith", sampleUri, "diffViewer");

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputCustomForUri(input, sampleUri) && input.viewType === "diffViewer";
  }, `Timed out waiting for Diff Viewer to open ${sampleUri.toString()}.`);
}

async function closeAllEditors() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await settle(STANDARD_SETTLE_MS);
}

async function openCollapsedDiffViewer(sampleUri) {
  const collapsedUri = sampleUri.with({ query: "collapsed" });

  console.log(`[smoke] Opening collapsed Diff Viewer for ${sampleUri.path}`);
  await vscode.commands.executeCommand("diffviewer.openCollapsed", sampleUri);

  await waitFor(async () => {
    const input = getActiveTabInput();
    return isTabInputCustomForUri(input, collapsedUri) && input.viewType === "diffViewer";
  }, `Timed out waiting for collapsed Diff Viewer to open ${collapsedUri.toString()}.`);

  return collapsedUri;
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

async function captureActiveTestState() {
  return vscode.commands.executeCommand("diffviewer._captureActiveTestState");
}

async function runActiveTestAction(action) {
  return vscode.commands.executeCommand("diffviewer._runActiveTestAction", action);
}

async function setDiffviewerConfig(key, value) {
  await vscode.workspace.getConfiguration("diffviewer").update(key, value, vscode.ConfigurationTarget.Global);
}

async function resetDiffviewerConfig() {
  for (const key of CONFIG_KEYS) {
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

function expectArrayIncludesAll(values, expectedValues, messagePrefix) {
  for (const expectedValue of expectedValues) {
    expect(values.includes(expectedValue), `${messagePrefix}: missing ${expectedValue}`);
  }
}

function expectArrayContainsSubstrings(values, expectedSubstrings, messagePrefix) {
  for (const expectedSubstring of expectedSubstrings) {
    expect(
      values.some((value) => value.includes(expectedSubstring)),
      `${messagePrefix}: missing substring ${expectedSubstring}`,
    );
  }
}

function expectCodeLinesIncludeAll(codeLineTexts, requiredSnippets, sampleUri) {
  for (const snippet of requiredSnippets) {
    expect(
      codeLineTexts.some((line) => line.includes(snippet)),
      `Expected rendered code for ${sampleUri.path} to contain: ${snippet}`,
    );
  }
}

async function assertRenderedState({
  sampleUri,
  expectedFileCount,
  expectedFilePaths,
  expectedHeaderSubstrings = [],
  requiredCodeSnippets = [],
  expectedOutputFormat,
  expectedCollapsedCount,
  expectedSelectedPath,
  expectedWarning,
  expectedColorScheme,
  expectedFileListVisible,
  expectedScrollbarVisible,
  expectedInlineHighlightCount,
  expectedInlineHighlightMinimum,
  expectedLightHighlightDisabled,
  expectedDarkHighlightDisabled,
}) {
  const state = await waitForTestState(
    (candidate) =>
      candidate.isReady &&
      candidate.fileCount === expectedFileCount &&
      (!expectedOutputFormat || candidate.outputFormat === expectedOutputFormat) &&
      (!expectedColorScheme || candidate.colorScheme === expectedColorScheme) &&
      (expectedFileListVisible === undefined || candidate.fileListVisible === expectedFileListVisible) &&
      (expectedScrollbarVisible === undefined || candidate.scrollbarVisible === expectedScrollbarVisible) &&
      (expectedInlineHighlightCount === undefined || candidate.inlineHighlightCount === expectedInlineHighlightCount) &&
      (expectedInlineHighlightMinimum === undefined ||
        candidate.inlineHighlightCount >= expectedInlineHighlightMinimum) &&
      (expectedLightHighlightDisabled === undefined ||
        candidate.lightHighlightDisabled === expectedLightHighlightDisabled) &&
      (expectedDarkHighlightDisabled === undefined ||
        candidate.darkHighlightDisabled === expectedDarkHighlightDisabled),
    `Timed out waiting for rendered test state for ${sampleUri.toString()}.`,
  );

  expect(state.fileCount === expectedFileCount, `Expected ${expectedFileCount} rendered files for ${sampleUri.path}.`);
  expectArrayIncludesAll(state.filePaths, expectedFilePaths, `Unexpected rendered paths for ${sampleUri.path}`);
  if (expectedHeaderSubstrings.length > 0) {
    expectArrayContainsSubstrings(
      state.fileHeaders,
      expectedHeaderSubstrings,
      `Unexpected rendered file headers for ${sampleUri.path}`,
    );
  }
  if (requiredCodeSnippets.length > 0) {
    expectCodeLinesIncludeAll(state.codeLineTexts, requiredCodeSnippets, sampleUri);
  }
  if (expectedOutputFormat) {
    expect(
      state.outputFormat === expectedOutputFormat,
      `Expected ${sampleUri.path} output format ${expectedOutputFormat}, received ${state.outputFormat}.`,
    );
  }
  if (expectedColorScheme) {
    expect(
      state.colorScheme === expectedColorScheme,
      `Expected ${sampleUri.path} color scheme ${expectedColorScheme}, received ${state.colorScheme}.`,
    );
  }
  if (expectedCollapsedCount !== undefined) {
    expect(
      state.collapsedFilePaths.length === expectedCollapsedCount,
      `Expected ${expectedCollapsedCount} collapsed files for ${sampleUri.path}, received ${state.collapsedFilePaths.length}.`,
    );
  }
  if (expectedSelectedPath) {
    expect(
      state.selectedPath === expectedSelectedPath,
      `Expected selected path ${expectedSelectedPath}, received ${state.selectedPath}.`,
    );
  }
  if (expectedWarning) {
    expect(
      state.largeDiffWarning?.includes(expectedWarning),
      `Expected warning for ${sampleUri.path} to contain "${expectedWarning}", received "${state.largeDiffWarning}".`,
    );
  }
  if (expectedFileListVisible !== undefined) {
    expect(
      state.fileListVisible === expectedFileListVisible,
      `Expected file list visibility ${expectedFileListVisible} for ${sampleUri.path}, received ${state.fileListVisible}.`,
    );
  }
  if (expectedScrollbarVisible !== undefined) {
    expect(
      state.scrollbarVisible === expectedScrollbarVisible,
      `Expected scrollbar visibility ${expectedScrollbarVisible} for ${sampleUri.path}, received ${state.scrollbarVisible}.`,
    );
  }
  if (expectedInlineHighlightCount !== undefined) {
    expect(
      state.inlineHighlightCount === expectedInlineHighlightCount,
      `Expected ${expectedInlineHighlightCount} inline highlights for ${sampleUri.path}, received ${state.inlineHighlightCount}.`,
    );
  }
  if (expectedInlineHighlightMinimum !== undefined) {
    expect(
      state.inlineHighlightCount >= expectedInlineHighlightMinimum,
      `Expected at least ${expectedInlineHighlightMinimum} inline highlights for ${sampleUri.path}, received ${state.inlineHighlightCount}.`,
    );
  }
  if (expectedLightHighlightDisabled !== undefined) {
    expect(
      state.lightHighlightDisabled === expectedLightHighlightDisabled,
      `Expected light highlight stylesheet disabled=${expectedLightHighlightDisabled} for ${sampleUri.path}, received ${state.lightHighlightDisabled}.`,
    );
  }
  if (expectedDarkHighlightDisabled !== undefined) {
    expect(
      state.darkHighlightDisabled === expectedDarkHighlightDisabled,
      `Expected dark highlight stylesheet disabled=${expectedDarkHighlightDisabled} for ${sampleUri.path}, received ${state.darkHighlightDisabled}.`,
    );
  }

  return state;
}

async function setOutputFormat(commandId, expectedOutputFormat, sampleUri, expectedFileCount) {
  await vscode.commands.executeCommand(commandId);
  await assertRenderedState({
    sampleUri,
    expectedFileCount,
    expectedFilePaths: [],
    expectedOutputFormat,
  });
}

async function runSampleScenario(sampleUri) {
  console.log(`[smoke] Starting rendered scenario for ${sampleUri.path}`);

  await vscode.commands.executeCommand("diffviewer.showLineByLine");
  await openDiffViewer(sampleUri);
  await settle(STANDARD_SETTLE_MS);
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
    expectedHeaderSubstrings: ["renamed new.ts", "deleted file.ts", "added file.ts"],
    requiredCodeSnippets: ["export const enabled = true;", 'export const title = "sample";'],
    expectedOutputFormat: "line-by-line",
  });
  await runActiveTestAction({ kind: "clickFileName", path: "src/renamed new.ts" });
  await waitForActiveEditor(
    (editor) => editor.document.uri.path.endsWith("/src/renamed new.ts"),
    "Timed out waiting for file-name click to open src/renamed new.ts.",
  );

  await openDiffViewer(sampleUri);
  await settle(STANDARD_SETTLE_MS);
  await runActiveTestAction({ kind: "clickLineNumber", path: "src/renamed new.ts", line: 2 });
  const lineEditor = await waitForActiveEditor(
    (editor) =>
      editor.document.uri.path.endsWith("/src/renamed new.ts") &&
      editor.selection.active.line === 1 &&
      editor.selection.anchor.line === 1,
    "Timed out waiting for line-number click to open src/renamed new.ts at line 2.",
  );
  expect(lineEditor.selection.active.character === 0, "Expected line-number click to select column 0.");

  await openDiffViewer(sampleUri);
  await settle(STANDARD_SETTLE_MS);

  await setOutputFormat("diffviewer.showSideBySide", "side-by-side", sampleUri, 3);
  await setOutputFormat("diffviewer.showLineByLine", "line-by-line", sampleUri, 3);
  await vscode.commands.executeCommand("diffviewer.collapseAll");
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
    expectedCollapsedCount: 3,
  });
  await vscode.commands.executeCommand("diffviewer.expandAll");
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
    expectedCollapsedCount: 0,
  });
  await runActiveTestAction({ kind: "toggleViewed", path: "src/renamed new.ts", viewed: true });
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
    expectedCollapsedCount: 1,
    expectedSelectedPath: "src/renamed new.ts",
  });
  await runActiveTestAction({ kind: "toggleViewed", path: "src/renamed new.ts", viewed: false });
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
    expectedCollapsedCount: 0,
    expectedSelectedPath: "src/renamed new.ts",
  });

  const collapsedUri = await openCollapsedDiffViewer(sampleUri);
  await settle(STANDARD_SETTLE_MS);
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
    expectedCollapsedCount: 3,
  });

  await openRawEditor(collapsedUri);
  await assertRawEditorMatches({
    sourceUri: sampleUri,
    expectedEditorUri: collapsedUri,
    expectedFileCount: 3,
    requiredSnippets: [
      "rename to src/renamed new.ts",
      "+export const enabled = true;",
      '+export const title = "sample";',
    ],
  });

  console.log(`[smoke] Finished rendered scenario for ${sampleUri.path}`);
}

async function runSpacesScenario(sampleUri) {
  console.log(`[smoke] Starting rendered scenario for ${sampleUri.path}`);
  await openDiffViewer(sampleUri);
  await settle(STANDARD_SETTLE_MS);
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedFilePaths: ["src/renamed space new.ts", "src/nested/added space.ts", "src/deleted space.ts"],
    expectedHeaderSubstrings: ["renamed space new.ts", "added space.ts", "deleted space.ts"],
    requiredCodeSnippets: ["export const active = true;", 'export const label = "with spaces";'],
  });

  await openRawEditor(sampleUri);
  await assertRawEditorMatches({
    sourceUri: sampleUri,
    expectedEditorUri: sampleUri,
    expectedFileCount: 3,
    requiredSnippets: [
      "rename to src/renamed space new.ts",
      '+export const label = "with spaces";',
      "deleted file mode 100644",
    ],
  });

  console.log(`[smoke] Finished rendered scenario for ${sampleUri.path}`);
}

async function runLargeScenario(sampleUri) {
  console.log(`[smoke] Starting rendered scenario for ${sampleUri.path}`);
  await openDiffViewer(sampleUri);
  await settle(LARGE_SETTLE_MS);
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 1,
    expectedFilePaths: ["src/large-file.ts"],
    expectedHeaderSubstrings: ["large-file.ts"],
    requiredCodeSnippets: ["export const oldValue0 = 0;", "export const oldValue119 = 119;"],
  });
  console.log(`[smoke] Finished rendered scenario for ${sampleUri.path}`);
}

async function runHugeScenario(sampleUri) {
  console.log(`[smoke] Starting rendered scenario for ${sampleUri.path}`);
  await openDiffViewer(sampleUri);
  await settle(LARGE_SETTLE_MS);
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 160,
    expectedFilePaths: ["src/generated/file-0001.ts", "src/generated/file-0160.ts"],
    expectedCollapsedCount: 160,
    expectedWarning: "Large diff detected.",
  });

  await openRawEditor(sampleUri);
  await assertRawEditorMatches({
    sourceUri: sampleUri,
    expectedEditorUri: sampleUri,
    expectedFileCount: 160,
    requiredSnippets: [
      "diff --git a/src/generated/file-0001.ts b/src/generated/file-0001.ts",
      "diff --git a/src/generated/file-0160.ts b/src/generated/file-0160.ts",
      "+export const newValue119 = 119 + 160;",
    ],
  });
  console.log(`[smoke] Finished rendered scenario for ${sampleUri.path}`);
}

async function runConfigScenario({ sampleUri, matchingUri, wideUri, emptyUri }) {
  console.log("[smoke] Starting config scenario");

  try {
    await setDiffviewerConfig("outputFormat", "line-by-line");
    await setDiffviewerConfig("drawFileList", true);
    await setDiffviewerConfig("matching", "none");
    await setDiffviewerConfig("colorScheme", "light");
    await setDiffviewerConfig("globalScrollbar", false);
    await setDiffviewerConfig("renderNothingWhenEmpty", false);

    await openDiffViewer(sampleUri);
    await settle(STANDARD_SETTLE_MS);
    await assertRenderedState({
      sampleUri,
      expectedFileCount: 3,
      expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
      expectedOutputFormat: "line-by-line",
      expectedColorScheme: "light",
      expectedFileListVisible: true,
      expectedLightHighlightDisabled: false,
      expectedDarkHighlightDisabled: true,
    });

    await setDiffviewerConfig("colorScheme", "dark");
    await assertRenderedState({
      sampleUri,
      expectedFileCount: 3,
      expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
      expectedOutputFormat: "line-by-line",
      expectedColorScheme: "dark",
      expectedFileListVisible: true,
      expectedLightHighlightDisabled: true,
      expectedDarkHighlightDisabled: false,
    });

    await setDiffviewerConfig("drawFileList", false);
    await assertRenderedState({
      sampleUri,
      expectedFileCount: 3,
      expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
      expectedColorScheme: "dark",
      expectedFileListVisible: false,
    });

    await setDiffviewerConfig("drawFileList", true);
    await assertRenderedState({
      sampleUri,
      expectedFileCount: 3,
      expectedFilePaths: ["src/renamed new.ts", "src/deleted file.ts", "src/added file.ts"],
      expectedColorScheme: "dark",
      expectedFileListVisible: true,
    });

    await openDiffViewer(matchingUri);
    await settle(STANDARD_SETTLE_MS);
    await assertRenderedState({
      sampleUri: matchingUri,
      expectedFileCount: 1,
      expectedFilePaths: ["src/matching.ts"],
      expectedInlineHighlightCount: 0,
    });

    await setDiffviewerConfig("matching", "words");
    await assertRenderedState({
      sampleUri: matchingUri,
      expectedFileCount: 1,
      expectedFilePaths: ["src/matching.ts"],
      expectedInlineHighlightMinimum: 1,
    });

    await setDiffviewerConfig("outputFormat", "side-by-side");
    await setDiffviewerConfig("globalScrollbar", false);
    await openDiffViewer(wideUri);
    await settle(STANDARD_SETTLE_MS);
    await assertRenderedState({
      sampleUri: wideUri,
      expectedFileCount: 1,
      expectedFilePaths: ["src/wide-file.ts"],
      expectedOutputFormat: "side-by-side",
      expectedScrollbarVisible: false,
    });

    await setDiffviewerConfig("globalScrollbar", true);
    await assertRenderedState({
      sampleUri: wideUri,
      expectedFileCount: 1,
      expectedFilePaths: ["src/wide-file.ts"],
      expectedOutputFormat: "side-by-side",
      expectedScrollbarVisible: true,
    });

    await setDiffviewerConfig("renderNothingWhenEmpty", false);
    await openDiffViewer(emptyUri);
    await settle(STANDARD_SETTLE_MS);
    await assertRenderedState({
      sampleUri: emptyUri,
      expectedFileCount: 1,
      expectedFilePaths: ["src/empty-file.ts"],
      expectedHeaderSubstrings: ["empty-file.ts"],
    });

    await setDiffviewerConfig("renderNothingWhenEmpty", true);
    await assertRenderedState({
      sampleUri: emptyUri,
      expectedFileCount: 0,
      expectedFilePaths: [],
    });
  } finally {
    await resetDiffviewerConfig();
  }

  console.log("[smoke] Finished config scenario");
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
  const matchingUri = vscode.Uri.joinPath(workspaceFolder.uri, "matching.patch");
  const wideUri = vscode.Uri.joinPath(workspaceFolder.uri, "wide.patch");
  const emptyUri = vscode.Uri.joinPath(workspaceFolder.uri, "empty-file.patch");

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Smoke test exceeded ${RUN_TIMEOUT_MS}ms.`)), RUN_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      (async () => {
        await runSampleScenario(sampleUri);
        await closeAllEditors();
        await runSpacesScenario(spacesUri);
        await closeAllEditors();
        await runLargeScenario(largeUri);
        await closeAllEditors();
        await runHugeScenario(hugeUri);
        await closeAllEditors();
        await runConfigScenario({ sampleUri, matchingUri, wideUri, emptyUri });
        await settle(FINAL_DELAY_MS);
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
