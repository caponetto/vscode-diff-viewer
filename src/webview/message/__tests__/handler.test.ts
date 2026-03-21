/**
 * @jest-environment jsdom
 */

import { ColorSchemeType, DiffFile } from "diff2html/lib/types";
import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { AppConfig } from "../../../extension/configuration";
import { SkeletonElementIds } from "../../../shared/css/elements";
import { UpdateWebviewPayload } from "../api";
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
                <table>
                  <tr>
                    <td class="d2h-code-side-linenumber">10</td>
                    <td class="d2h-code-line">content</td>
                  </tr>
                </table>
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
    <div id="${SkeletonElementIds.LargeDiffNoticeContainer}"></div>
    <link id="${SkeletonElementIds.HighlightLightStylesheet}" rel="stylesheet" />
    <link id="${SkeletonElementIds.HighlightDarkStylesheet}" rel="stylesheet" />
    <div id="${SkeletonElementIds.DiffContainer}"></div>
    <footer>
      <span id="${SkeletonElementIds.ViewedIndicator}"></span>
      <progress id="${SkeletonElementIds.ViewedProgressContainer}" max="100" value="0"></progress>
    </footer>
  `;
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
    expect(notice.textContent).toBe("Large diff detected.");
    expect(mockGetSha1Hash).not.toHaveBeenCalled();

    const viewedToggle = document.querySelector<HTMLInputElement>(".d2h-file-collapse-input");
    expect(viewedToggle).toBeTruthy();
    if (viewedToggle) {
      viewedToggle.checked = true;
      viewedToggle.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(mockGetSha1Hash).toHaveBeenCalledTimes(1);
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
});
