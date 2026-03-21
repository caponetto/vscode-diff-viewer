/**
 * @jest-environment jsdom
 */

import { ColorSchemeType, DiffFile } from "diff2html/lib/types";
import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { SkeletonElementIds } from "../../../shared/css/elements";
import { MessageToWebviewHandlerImpl } from "../handler";
import { getSha1Hash } from "../hash";

jest.mock("diff2html/lib/ui/js/diff2html-ui-slim.js", () => ({
  Diff2HtmlUI: jest.fn().mockImplementation((container: HTMLElement, diffFiles: DiffFile[]) => ({
    draw: jest.fn(() => {
      container.innerHTML = diffFiles
        .map(
          (diffFile) => `
            <div class="d2h-file-wrapper">
              <div class="d2h-file-header">
                <a class="d2h-file-name">${diffFile.newName ?? diffFile.oldName ?? ""}</a>
                <label class="d2h-file-collapse">
                  <input class="d2h-file-collapse-input" type="checkbox" />
                </label>
              </div>
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
              </div>
            </div>`,
        )
        .join("");
    }),
  })),
}));

jest.mock("../hash", () => ({
  getSha1Hash: jest.fn(),
}));

const mockGetSha1Hash = getSha1Hash as jest.MockedFunction<typeof getSha1Hash>;

const createDiffFile = (args: Partial<DiffFile> & Pick<DiffFile, "newName" | "oldName">): DiffFile =>
  ({
    blocks: [],
    addedLines: 0,
    deletedLines: 0,
    isCombined: false,
    isGitDiff: true,
    language: "typescript",
    ...args,
  }) as DiffFile;

const config = {
  diff2html: {
    outputFormat: "side-by-side" as const,
    drawFileList: true,
    matching: "none" as const,
    matchWordsThreshold: 0.25,
    matchingMaxComparisons: 2500,
    maxLineSizeInBlockForComparison: 200,
    maxLineLengthHighlight: 10000,
    renderNothingWhenEmpty: false,
    colorScheme: ColorSchemeType.LIGHT,
  },
};

function renderDom(): void {
  document.body.innerHTML = `
    <div id="${SkeletonElementIds.LoadingContainer}" style="display:none"></div>
    <div id="${SkeletonElementIds.EmptyMessageContainer}" style="display:none"></div>
    <div id="${SkeletonElementIds.LargeDiffNoticeContainer}" style="display:none"></div>
    <link id="${SkeletonElementIds.HighlightLightStylesheet}" rel="stylesheet" />
    <link id="${SkeletonElementIds.HighlightDarkStylesheet}" rel="stylesheet" />
    <div id="${SkeletonElementIds.DiffContainer}"></div>
    <footer>
      <span id="${SkeletonElementIds.ViewedIndicator}"></span>
      <progress id="${SkeletonElementIds.ViewedProgressContainer}" max="100" value="0"></progress>
    </footer>
  `;
}

describe("MessageToWebviewHandlerImpl extra coverage", () => {
  let handler: MessageToWebviewHandlerImpl;
  const postMessageToExtensionFn = jest.fn();
  const setState = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    renderDom();
    mockGetSha1Hash.mockResolvedValue("sha:1");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: jest.fn(),
      configurable: true,
      writable: true,
    });
    handler = new MessageToWebviewHandlerImpl({
      postMessageToExtensionFn,
      state: { getState: () => undefined, setState },
    });
    expect(Diff2HtmlUI).toBeDefined();
  });

  it("returns early when the diff container is missing", async () => {
    document.getElementById(SkeletonElementIds.DiffContainer)?.remove();

    await expect(
      handler.updateWebview({
        config,
        diffFiles: [],
        accessiblePaths: [],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    ).resolves.toBeUndefined();
  });

  it("handles expand, collapse and showRaw actions", async () => {
    await handler.updateWebview({
      config,
      diffFiles: [createDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
      accessiblePaths: ["src/file.ts"],
      viewedState: {},
      collapseAll: false,
      performance: { isLargeDiff: false, deferViewedStateHashing: false },
    });

    handler.performWebviewAction({ action: "collapseAll" });
    await Promise.resolve();
    handler.performWebviewAction({ action: "expandAll" });
    await Promise.resolve();
    handler.performWebviewAction({ action: "showRaw" });

    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "toggleFileViewed",
      payload: { path: "src/file.ts", viewedSha1: "sha:1" },
    });
    expect(postMessageToExtensionFn).toHaveBeenCalledWith({
      kind: "toggleFileViewed",
      payload: { path: "src/file.ts", viewedSha1: null },
    });
  });

  it("opens files when clicking file names and line numbers", async () => {
    await handler.updateWebview({
      config,
      diffFiles: [createDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
      accessiblePaths: ["src/file.ts"],
      viewedState: {},
      collapseAll: false,
      performance: { isLargeDiff: false, deferViewedStateHashing: false },
    });

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

  it("does not open files for ignored side-by-side left-column clicks", async () => {
    await handler.updateWebview({
      config,
      diffFiles: [createDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
      accessiblePaths: ["src/file.ts"],
      viewedState: {},
      collapseAll: false,
      performance: { isLargeDiff: false, deferViewedStateHashing: false },
    });

    document.querySelector(".d2h-file-side-diff")?.classList.add("d2h-file-side-diff-left");
    const lineNumber = document.querySelectorAll(".d2h-code-side-linenumber")[0] as HTMLElement;
    lineNumber.click();

    expect(postMessageToExtensionFn).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "openFile" }));
  });

  it("marks files as changed since last view when hashes differ", async () => {
    mockGetSha1Hash.mockResolvedValue("sha:new");

    await handler.updateWebview({
      config,
      diffFiles: [createDiffFile({ oldName: "src/file.ts", newName: "src/file.ts" })],
      accessiblePaths: ["src/file.ts"],
      viewedState: { "src/file.ts": "sha:old" },
      collapseAll: false,
      performance: { isLargeDiff: false, deferViewedStateHashing: false },
    });

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
      handler.updateWebview({
        config,
        diffFiles: [],
        accessiblePaths: [],
        viewedState: {},
        collapseAll: false,
        performance: { isLargeDiff: false, deferViewedStateHashing: false },
      }),
    ).resolves.toBeUndefined();
  });
});
