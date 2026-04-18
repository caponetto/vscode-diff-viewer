/**
 * @jest-environment jsdom
 */

import { ColorSchemeType, DiffFile } from "diff2html/lib/types";
import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { AppConfig } from "../../../../extension/configuration";
import { SkeletonElementIds } from "../../../../shared/css/elements";
import { UpdateWebviewPayload } from "../../api";
import { MessageToWebviewHandlerImpl } from "..";
import { getSha1Hash } from "../../hash";

jest.mock("diff2html/lib/ui/js/diff2html-ui-slim.js", () => ({
  Diff2HtmlUI: jest
    .fn()
    .mockImplementation((container: HTMLElement, diffFiles: DiffFile[], config: AppConfig["diff2html"]) => ({
      draw: jest.fn(() => {
        container.innerHTML = diffFiles
          .map((diffFile) => {
            const fileBody =
              config.outputFormat === "line-by-line"
                ? `
                <div class="d2h-file-diff">
                  <table>
                    <tr>
                      <td class="d2h-code-linenumber d2h-del">
                        <div class="line-num2">10</div>
                      </td>
                      <td class="d2h-code-line">removed</td>
                    </tr>
                    <tr>
                      <td class="d2h-code-linenumber d2h-ins">
                        <div class="line-num2">24</div>
                      </td>
                      <td class="d2h-code-line">added</td>
                    </tr>
                    <tr>
                      <td class="d2h-code-linenumber d2h-info">
                        <div class="line-num2">...</div>
                      </td>
                      <td class="d2h-code-line">info</td>
                    </tr>
                  </table>
                </div>`
                : `
                <div class="d2h-file-diff">
                  <div class="d2h-file-side-diff">
                    <table>
                      <tr>
                        <td class="d2h-code-side-linenumber d2h-cntx">11</td>
                        <td class="d2h-code-line">left</td>
                      </tr>
                    </table>
                  </div>
                  <div class="d2h-file-side-diff">
                    <table>
                      <tr>
                        <td class="d2h-code-side-linenumber d2h-cntx">12</td>
                        <td class="d2h-code-line">content</td>
                      </tr>
                    </table>
                  </div>
                </div>`;

            return `
            <div class="d2h-file-wrapper">
              <div class="d2h-file-header">
                <a class="d2h-file-name">${diffFile.newName ?? diffFile.oldName ?? ""}</a>
                <label class="d2h-file-collapse">
                  <input class="d2h-file-collapse-input" type="checkbox" />
                </label>
              </div>
              ${fileBody}
            </div>`;
          })
          .join("");
      }),
    })),
}));

jest.mock("../../hash", () => ({
  getSha1Hash: jest.fn(),
}));

const mockGetSha1Hash = getSha1Hash as jest.MockedFunction<typeof getSha1Hash>;

const createMockDiffFile = (args: Partial<DiffFile> & Pick<DiffFile, "newName" | "oldName">): DiffFile =>
  ({
    blocks: [],
    addedLines: 0,
    deletedLines: 0,
    isCombined: false,
    isGitDiff: true,
    language: "typescript",
    ...args,
  }) as DiffFile;

const createConfig = (): AppConfig => ({
  globalScrollbar: false,
  diff2html: {
    outputFormat: "side-by-side",
    drawFileList: true,
    matching: "none",
    matchWordsThreshold: 0.25,
    matchingMaxComparisons: 2500,
    maxLineSizeInBlockForComparison: 200,
    maxLineLengthHighlight: 10000,
    renderNothingWhenEmpty: false,
    colorScheme: ColorSchemeType.LIGHT,
  },
});

const createUpdatePayload = (overrides: Partial<UpdateWebviewPayload>): UpdateWebviewPayload => ({
  config: createConfig(),
  diffFiles: [],
  accessiblePaths: [],
  viewedState: {},
  collapseAll: false,
  performance: {
    isLargeDiff: false,
    deferViewedStateHashing: false,
  },
  ...overrides,
});

const renderSkeleton = (): void => {
  document.body.innerHTML = `
    <div id="${SkeletonElementIds.LoadingContainer}"></div>
    <div id="${SkeletonElementIds.EmptyMessageContainer}"></div>
    <div id="${SkeletonElementIds.LargeDiffNoticeContainer}" style="display: none">
      <span id="${SkeletonElementIds.LargeDiffNoticeMessage}"></span>
      <button id="${SkeletonElementIds.LargeDiffNoticeDismiss}" type="button">Close</button>
    </div>
    <link id="${SkeletonElementIds.HighlightLightStylesheet}" rel="stylesheet" />
    <link id="${SkeletonElementIds.HighlightDarkStylesheet}" rel="stylesheet" />
    <div id="${SkeletonElementIds.DiffContainer}"></div>
    <footer>
      <div id="${SkeletonElementIds.FooterStatus}">
        <span id="${SkeletonElementIds.ViewedIndicator}"></span>
        <progress id="${SkeletonElementIds.ViewedProgressContainer}" max="100" value="0"></progress>
      </div>
      <div id="${SkeletonElementIds.HorizontalScrollbarContainer}">
        <div id="${SkeletonElementIds.HorizontalScrollbarContent}"></div>
      </div>
    </footer>
  `;
};

const setElementDimensions = (element: HTMLElement, dimensions: { clientWidth: number; scrollWidth: number }): void => {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: dimensions.clientWidth,
  });
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: dimensions.scrollWidth,
  });
};

describe("MessageToWebviewHandlerImpl", () => {
  let postMessageToExtensionFn: jest.Mock;
  let setState: jest.Mock;
  let handler: MessageToWebviewHandlerImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    renderSkeleton();

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: jest.fn(),
      configurable: true,
      writable: true,
    });
    postMessageToExtensionFn = jest.fn();
    setState = jest.fn();
    mockGetSha1Hash.mockImplementation(async (value) => `sha:${value}`);

    handler = new MessageToWebviewHandlerImpl({
      postMessageToExtensionFn,
      state: {
        getState: () => ({
          scrollTop: 96,
          selectedPath: "src/renamed new.ts",
        }),
        setState,
      },
    });
  });

  it("renders file navigation buttons for renamed and regular files", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [
          createMockDiffFile({ oldName: "src/renamed old.ts", newName: "src/renamed new.ts" }),
          createMockDiffFile({ oldName: "/dev/null", newName: "src/added.ts" }),
        ],
        accessiblePaths: ["src/renamed old.ts", "src/renamed new.ts", "src/added.ts"],
      }),
    );

    const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".diff-viewer-file-action-button"));
    expect(actionButtons.map((button) => button.textContent)).toEqual(["Open old", "Open new", "Open file"]);

    const firstHeader = document.querySelector<HTMLElement>(".d2h-file-header");
    const firstActions = firstHeader?.querySelector<HTMLElement>(".diff-viewer-file-actions");
    const firstViewedToggle = firstHeader?.querySelector<HTMLElement>(".d2h-file-collapse");
    expect(firstActions).toBeTruthy();
    expect(firstViewedToggle).toBeTruthy();
    expect(firstActions?.nextElementSibling).toBe(firstViewedToggle);
  });

  it("opens explicit old and new file actions through extension messages", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/old name.ts", newName: "src/new name.ts" })],
        accessiblePaths: ["src/old name.ts", "src/new name.ts"],
      }),
    );

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".diff-viewer-file-action-button"));
    buttons[0]?.click();
    buttons[1]?.click();

    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/old name.ts", line: undefined },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/new name.ts", line: undefined },
    });
  });

  it("restores selected file from persisted UI state", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/renamed old.ts", newName: "src/renamed new.ts" })],
        accessiblePaths: ["src/renamed old.ts", "src/renamed new.ts"],
      }),
    );

    const selectedFile = document.querySelector<HTMLElement>(".selected-file");
    expect(selectedFile?.dataset.diffPath).toBe("src/renamed new.ts");
  });

  it("shows a large-diff warning and defers hashing until a file is marked viewed", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        performance: {
          isLargeDiff: true,
          warning: "Large diff detected.",
          deferViewedStateHashing: true,
        },
      }),
    );

    const notice = document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement;
    const noticeMessage = document.getElementById(SkeletonElementIds.LargeDiffNoticeMessage) as HTMLSpanElement;
    expect(notice.style.display).toBe("flex");
    expect(noticeMessage.textContent).toBe("Large diff detected.");
    expect(mockGetSha1Hash).not.toHaveBeenCalled();

    const viewedToggle = document.querySelector<HTMLInputElement>(".d2h-file-collapse-input");
    expect(viewedToggle).toBeTruthy();
    if (viewedToggle) {
      viewedToggle.checked = true;
      viewedToggle.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(mockGetSha1Hash).toHaveBeenCalledTimes(1);
  });

  it("keeps the large-diff warning dismissed for the current open view", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        performance: {
          isLargeDiff: true,
          warning: "Large diff detected.",
          deferViewedStateHashing: true,
        },
      }),
    );

    (document.getElementById(SkeletonElementIds.LargeDiffNoticeDismiss) as HTMLButtonElement).click();
    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement).style.display).toBe(
      "none",
    );

    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        performance: {
          isLargeDiff: true,
          warning: "Large diff detected.",
          deferViewedStateHashing: true,
        },
      }),
    );

    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement).style.display).toBe(
      "none",
    );
  });

  it("shows a new large-diff warning after a different one was dismissed", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        performance: {
          isLargeDiff: true,
          warning: "Large diff detected.",
          deferViewedStateHashing: true,
        },
      }),
    );

    (document.getElementById(SkeletonElementIds.LargeDiffNoticeDismiss) as HTMLButtonElement).click();

    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        performance: {
          isLargeDiff: true,
          warning: "Large diff detected. Rendering may be slower than usual.",
          deferViewedStateHashing: true,
        },
      }),
    );

    const notice = document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement;
    const noticeMessage = document.getElementById(SkeletonElementIds.LargeDiffNoticeMessage) as HTMLSpanElement;
    expect(notice.style.display).toBe("flex");
    expect(noticeMessage.textContent).toBe("Large diff detected. Rendering may be slower than usual.");
  });

  it("shows only file actions for accessible paths", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [
          createMockDiffFile({ oldName: "src/renamed old.ts", newName: "src/renamed new.ts" }),
          createMockDiffFile({ oldName: "/dev/null", newName: "src/missing.ts" }),
        ],
        accessiblePaths: ["src/renamed new.ts"],
      }),
    );

    const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".diff-viewer-file-action-button"));
    expect(actionButtons.map((button) => button.textContent)).toEqual(["Open new"]);
  });

  it("uses Diff2HtmlUI to draw the diff", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
      }),
    );

    expect(Diff2HtmlUI).toHaveBeenCalled();
  });

  it("hides the sticky horizontal scrollbar when the last expanded file is collapsed and the page does not overflow", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        config: {
          ...createConfig(),
          globalScrollbar: true,
        },
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
      }),
    );

    const sideDiffs = Array.from(document.querySelectorAll<HTMLElement>(".d2h-file-side-diff"));
    sideDiffs.forEach((element) => setElementDimensions(element, { clientWidth: 120, scrollWidth: 420 }));

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    globalThis.dispatchEvent(new Event("resize"));
    expect(scrollbar.style.display).toBe("block");

    const root = document.documentElement;
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: root,
    });
    setElementDimensions(root, { clientWidth: 200, scrollWidth: 200 });

    const viewedToggle = document.querySelector<HTMLInputElement>(".d2h-file-collapse-input");
    expect(viewedToggle).toBeTruthy();
    if (viewedToggle) {
      viewedToggle.checked = true;
      viewedToggle.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(scrollbar.style.display).toBe("none");
  });

  it("returns early when the diff container is missing", async () => {
    document.getElementById(SkeletonElementIds.DiffContainer)?.remove();

    await expect(
      handler.updateWebview(
        createUpdatePayload({
          diffFiles: [],
          accessiblePaths: [],
          viewedState: {},
          collapseAll: false,
          performance: { isLargeDiff: false, deferViewedStateHashing: false },
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("handles expand, collapse and showRaw actions", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    handler.performWebviewAction({ action: "collapseAll" });
    await Promise.resolve();
    handler.performWebviewAction({ action: "expandAll" });
    await Promise.resolve();
    handler.performWebviewAction({ action: "showRaw" });

    expect(postMessageToExtensionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "toggleFileViewed",
        payload: expect.objectContaining({
          path: "src/file.ts",
          viewedSha1: expect.stringContaining("sha:"),
        }),
      }),
    );
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "toggleFileViewed",
      payload: { path: "src/file.ts", viewedSha1: null },
    });
  });

  it("reports structured test state from the rendered webview", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    handler.captureTestState({ requestId: "req-1" });

    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "reportTestState",
      payload: {
        requestId: "req-1",
        state: expect.objectContaining({
          isReady: true,
          shellGeneration: 0,
          outputFormat: "side-by-side",
          fileCount: 1,
          filePaths: ["src/file.ts"],
          fileHeaders: ["src/file.ts"],
          collapsedFilePaths: [],
          selectedPath: "src/renamed new.ts",
        }),
      },
    });
  });

  it("runs supported test actions against rendered elements", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    await handler.runTestAction({ requestId: "req-file", action: { kind: "clickFileName", path: "src/file.ts" } });
    await handler.runTestAction({
      requestId: "req-line",
      action: { kind: "clickLineNumber", path: "src/file.ts", line: 12 },
    });
    await handler.runTestAction({
      requestId: "req-toggle",
      action: { kind: "toggleViewed", path: "src/file.ts", viewed: true },
    });

    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "reportTestActionResult",
      payload: { requestId: "req-file" },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "reportTestActionResult",
      payload: { requestId: "req-line" },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "reportTestActionResult",
      payload: { requestId: "req-toggle" },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/file.ts", line: undefined },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/file.ts", line: 12 },
    });
  });

  it("opens files when clicking file names and line numbers", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    const fileLink = document.querySelector(".d2h-file-name") as HTMLElement;
    const lineNumber = document.querySelectorAll(".d2h-code-side-linenumber")[1] as HTMLElement;

    fileLink.click();
    lineNumber.click();

    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/file.ts", line: undefined },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/file.ts", line: 12 },
    });
  });

  it("opens right-side line-by-line numbers and ignores deleted or info rows", async () => {
    const baseConfig = createConfig();

    await handler.updateWebview(
      createUpdatePayload({
        config: {
          ...baseConfig,
          diff2html: {
            ...baseConfig.diff2html,
            outputFormat: "line-by-line",
          },
        },
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    const [deletedLineNumber, addedLineNumber, infoLineNumber] = Array.from(
      document.querySelectorAll<HTMLElement>(".d2h-code-linenumber"),
    );

    deletedLineNumber?.click();
    infoLineNumber?.click();
    expect(postMessageToExtensionFn).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "openFile" }));

    addedLineNumber?.click();

    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "openFile",
      payload: { path: "src/file.ts", line: 24 },
    });
  });

  it("does not open files for ignored side-by-side left-column clicks", async () => {
    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    const lineNumber = document.querySelectorAll(".d2h-code-side-linenumber")[0] as HTMLElement;
    lineNumber.click();

    expect(postMessageToExtensionFn).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "openFile" }));
  });

  it("marks files as changed since last view when hashes differ", async () => {
    mockGetSha1Hash.mockResolvedValue("sha:new");

    await handler.updateWebview(
      createUpdatePayload({
        diffFiles: [createMockDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
        accessiblePaths: ["src/file.ts"],
        viewedState: { "src/file.ts": "sha:old" },
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    );

    const toggle = document.querySelector(".d2h-file-collapse-input") as HTMLInputElement;
    const label = document.querySelector(".d2h-file-collapse") as HTMLElement;
    expect(toggle.classList.contains("changed-since-last-view")).toBe(true);
    expect(label.classList.contains("changed-since-last-view")).toBe(true);
  });

  it("handles missing footer and missing theme stylesheets safely", async () => {
    document.getElementById(SkeletonElementIds.ViewedIndicator)?.remove();
    document.getElementById(SkeletonElementIds.HighlightLightStylesheet)?.remove();
    document.getElementById(SkeletonElementIds.HighlightDarkStylesheet)?.remove();
    document.getElementById(SkeletonElementIds.EmptyMessageContainer)?.remove();

    await expect(
      handler.updateWebview(
        createUpdatePayload({
          diffFiles: [],
          accessiblePaths: [],
          viewedState: {},
          collapseAll: false,
          performance: { isLargeDiff: false, deferViewedStateHashing: false },
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
