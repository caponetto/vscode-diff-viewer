const vscode = require("vscode");
const {
  assertRawEditorMatches,
  expect,
  openCollapsedDiffViewer,
  openDiffViewer,
  openRawEditor,
  resetDiffviewerConfig,
  runActiveTestAction,
  setDiffviewerConfig,
  settle,
  waitForActiveEditor,
  waitForTestState,
} = require("../../smoke/tests/helpers.cjs");

const SETTLE_MS = 1_000;
const CONFIG_KEYS = [
  "colorScheme",
  "drawFileList",
  "globalScrollbar",
  "matching",
  "outputFormat",
  "renderNothingWhenEmpty",
];

async function assertRenderedState({
  sampleUri,
  expectedFileCount,
  expectedPaths,
  expectedOutputFormat,
  expectedCollapsedCount,
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
    `Timed out waiting for rendered state for ${sampleUri.toString()}.`,
  );

  for (const expectedPath of expectedPaths) {
    expect(state.filePaths.includes(expectedPath), `Expected ${sampleUri.path} to render ${expectedPath}.`);
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

async function ensureExtensionActive() {
  const extension = vscode.extensions.getExtension("caponetto.vscode-diff-viewer");
  expect(extension, "Expected the Diff Viewer extension to be installed in the test host.");
  await extension.activate();
  expect(extension.isActive, "Expected the Diff Viewer extension to be active.");
}

async function runConfigScenario({ sampleUri, matchingUri, wideUri, emptyUri }) {
  try {
    await setDiffviewerConfig("outputFormat", "line-by-line");
    await setDiffviewerConfig("drawFileList", true);
    await setDiffviewerConfig("matching", "none");
    await setDiffviewerConfig("colorScheme", "light");
    await setDiffviewerConfig("globalScrollbar", false);
    await setDiffviewerConfig("renderNothingWhenEmpty", false);

    await openDiffViewer(sampleUri);
    await settle(SETTLE_MS);
    await assertRenderedState({
      sampleUri,
      expectedFileCount: 3,
      expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
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
      expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
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
      expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
      expectedColorScheme: "dark",
      expectedFileListVisible: false,
    });

    await setDiffviewerConfig("drawFileList", true);
    await assertRenderedState({
      sampleUri,
      expectedFileCount: 3,
      expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
      expectedColorScheme: "dark",
      expectedFileListVisible: true,
    });

    await openDiffViewer(matchingUri);
    await settle(SETTLE_MS);
    await assertRenderedState({
      sampleUri: matchingUri,
      expectedFileCount: 1,
      expectedPaths: ["src/matching.ts"],
      expectedInlineHighlightCount: 0,
    });

    await setDiffviewerConfig("matching", "words");
    await assertRenderedState({
      sampleUri: matchingUri,
      expectedFileCount: 1,
      expectedPaths: ["src/matching.ts"],
      expectedInlineHighlightMinimum: 1,
    });

    await setDiffviewerConfig("outputFormat", "side-by-side");
    await setDiffviewerConfig("globalScrollbar", false);
    await openDiffViewer(wideUri);
    await settle(SETTLE_MS);
    await assertRenderedState({
      sampleUri: wideUri,
      expectedFileCount: 1,
      expectedPaths: ["src/wide-file.ts"],
      expectedOutputFormat: "side-by-side",
      expectedScrollbarVisible: false,
    });

    await setDiffviewerConfig("globalScrollbar", true);
    await assertRenderedState({
      sampleUri: wideUri,
      expectedFileCount: 1,
      expectedPaths: ["src/wide-file.ts"],
      expectedOutputFormat: "side-by-side",
      expectedScrollbarVisible: true,
    });

    await setDiffviewerConfig("renderNothingWhenEmpty", false);
    await openDiffViewer(emptyUri);
    await settle(SETTLE_MS);
    await assertRenderedState({
      sampleUri: emptyUri,
      expectedFileCount: 1,
      expectedPaths: ["src/empty-file.ts"],
    });

    await setDiffviewerConfig("renderNothingWhenEmpty", true);
    await assertRenderedState({
      sampleUri: emptyUri,
      expectedFileCount: 0,
      expectedPaths: [],
    });
  } finally {
    await resetDiffviewerConfig(CONFIG_KEYS);
  }
}

async function run() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("Desktop integration test requires a workspace folder.");
  }

  await ensureExtensionActive();

  const sampleUri = vscode.Uri.joinPath(workspaceFolder.uri, "sample.diff");
  const spacesUri = vscode.Uri.joinPath(workspaceFolder.uri, "spaces.patch");
  const matchingUri = vscode.Uri.joinPath(workspaceFolder.uri, "matching.patch");
  const wideUri = vscode.Uri.joinPath(workspaceFolder.uri, "wide.patch");
  const emptyUri = vscode.Uri.joinPath(workspaceFolder.uri, "empty-file.patch");

  await vscode.commands.executeCommand("diffviewer.showLineByLine");
  await openDiffViewer(sampleUri);
  await settle(SETTLE_MS);
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
    expectedOutputFormat: "line-by-line",
  });
  await runActiveTestAction({ kind: "clickFileName", path: "src/renamed new.ts" });
  await waitForActiveEditor(
    (editor) => editor.document.uri.path.endsWith("/src/renamed new.ts"),
    "Timed out waiting for file-name click to open src/renamed new.ts.",
  );

  await openDiffViewer(sampleUri);
  await settle(SETTLE_MS);
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
  await settle(SETTLE_MS);
  await vscode.commands.executeCommand("diffviewer.showSideBySide");
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
    expectedOutputFormat: "side-by-side",
  });
  await vscode.commands.executeCommand("diffviewer.collapseAll");
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
    expectedCollapsedCount: 3,
  });
  await vscode.commands.executeCommand("diffviewer.expandAll");
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
    expectedCollapsedCount: 0,
  });
  await runActiveTestAction({ kind: "toggleViewed", path: "src/renamed new.ts", viewed: true });
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
    expectedCollapsedCount: 1,
  });
  await runActiveTestAction({ kind: "toggleViewed", path: "src/renamed new.ts", viewed: false });
  await assertRenderedState({
    sampleUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed new.ts", "src/added file.ts"],
    expectedCollapsedCount: 0,
  });

  await openDiffViewer(spacesUri);
  await settle(SETTLE_MS);
  await assertRenderedState({
    sampleUri: spacesUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed space new.ts", "src/nested/added space.ts"],
  });

  const collapsedUri = await openCollapsedDiffViewer(spacesUri);
  await settle(SETTLE_MS);
  await assertRenderedState({
    sampleUri: spacesUri,
    expectedFileCount: 3,
    expectedPaths: ["src/renamed space new.ts", "src/nested/added space.ts"],
    expectedCollapsedCount: 3,
  });

  await openRawEditor(collapsedUri);
  await assertRawEditorMatches({
    sourceUri: spacesUri,
    expectedEditorUri: collapsedUri,
    expectedFileCount: 3,
    requiredSnippets: [
      "rename to src/renamed space new.ts",
      '+export const label = "with spaces";',
      "deleted file mode 100644",
    ],
  });

  await runConfigScenario({ sampleUri, matchingUri, wideUri, emptyUri });
}

module.exports = {
  run,
};
