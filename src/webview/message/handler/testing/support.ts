import { AppConfig } from "../../../../extension/configuration";
import { SkeletonElementIds } from "../../../../shared/css/elements";
import { MessageToExtension } from "../../../../shared/message";
import { Diff2HtmlCssClassElements } from "../../../css/elements";
import { WebviewTestAction, WebviewTestState } from "../../testing/api";
import { FileDomBinding } from "../types";

export class WebviewHandlerTestSupport {
  public constructor(
    private readonly args: {
      postMessageToExtensionFn: (message: MessageToExtension) => void;
      getCurrentConfig: () => AppConfig | undefined;
      getFileBindings: () => FileDomBinding[];
      getSelectedPath: () => string | undefined;
      getClickedLineNumber: (element: HTMLElement) => number | undefined;
    },
  ) {}

  public captureTestState(payload: { requestId: string }): void {
    this.args.postMessageToExtensionFn({
      kind: "reportTestState",
      payload: {
        requestId: payload.requestId,
        state: this.buildTestState(),
      },
    });
  }

  public async runTestAction(payload: { requestId: string; action: WebviewTestAction }): Promise<void> {
    try {
      await this.executeTestAction(payload.action);
      this.args.postMessageToExtensionFn({
        kind: "reportTestActionResult",
        payload: { requestId: payload.requestId },
      });
    } catch (error) {
      this.args.postMessageToExtensionFn({
        kind: "reportTestActionResult",
        payload: {
          requestId: payload.requestId,
          error: error instanceof Error ? error.message : "Unknown test action failure.",
        },
      });
    }
  }

  private async executeTestAction(action: WebviewTestAction): Promise<void> {
    const binding = this.args.getFileBindings().find((candidate) => candidate.filePath === action.path);
    if (!binding) {
      throw new Error(`No rendered file binding found for ${action.path}.`);
    }

    switch (action.kind) {
      case "clickFileName": {
        const fileNameLink = binding.fileContainer.querySelector<HTMLElement>(Diff2HtmlCssClassElements.A__FileName);
        if (!fileNameLink) {
          throw new Error(`No file name link found for ${action.path}.`);
        }
        fileNameLink.click();
        return;
      }
      case "clickLineNumber": {
        const lineNumberElement = this.findRenderedLineNumberElement(binding.fileContainer, action.line);
        if (!lineNumberElement) {
          throw new Error(`No rendered line number ${action.line} found for ${action.path}.`);
        }
        lineNumberElement.click();
        return;
      }
      case "toggleViewed": {
        const toggle = binding.viewedToggle;
        if (!toggle) {
          throw new Error(`No viewed toggle found for ${action.path}.`);
        }
        if (toggle.checked !== action.viewed) {
          toggle.checked = action.viewed;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
    }
  }

  private findRenderedLineNumberElement(fileContainer: HTMLElement, line: number): HTMLElement | undefined {
    const currentConfig = this.args.getCurrentConfig();
    if (!currentConfig) {
      return undefined;
    }

    const selector =
      currentConfig.diff2html.outputFormat === "line-by-line"
        ? Diff2HtmlCssClassElements.Td__LineNumberOnLineByLine
        : Diff2HtmlCssClassElements.Td__LineNumberOnSideBySide;

    return Array.from(fileContainer.querySelectorAll<HTMLElement>(selector)).find(
      (element) => this.args.getClickedLineNumber(element) === line,
    );
  }

  private buildTestState(): WebviewTestState {
    const currentConfig = this.args.getCurrentConfig();
    const fileBindings = this.args.getFileBindings();
    const diffContainer = document.getElementById(SkeletonElementIds.DiffContainer);
    const fileList = diffContainer?.querySelector<HTMLElement>(".d2h-file-list-wrapper");
    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer);
    const lightStylesheet = document.getElementById(SkeletonElementIds.HighlightLightStylesheet);
    const darkStylesheet = document.getElementById(SkeletonElementIds.HighlightDarkStylesheet);
    const fileHeaders = fileBindings
      .map(({ fileContainer }) =>
        fileContainer.querySelector(Diff2HtmlCssClassElements.A__FileName)?.textContent?.trim(),
      )
      .flatMap((header) => (header ? [header] : []));
    const collapsedFilePaths = fileBindings
      .filter(({ viewedToggle }) => viewedToggle?.checked)
      .map(({ filePath }) => filePath);
    const largeDiffNotice = document.getElementById(SkeletonElementIds.LargeDiffNoticeMessage)?.textContent?.trim();
    const codeLineTexts = Array.from(diffContainer?.querySelectorAll<HTMLElement>(".d2h-code-line") ?? [])
      .map((element) => element.textContent?.trim())
      .flatMap((text) => (text ? [text] : []))
      .slice(0, 500);
    const inlineHighlightCount =
      diffContainer?.querySelectorAll(".d2h-code-line .d2h-change, .d2h-code-side-line .d2h-change").length ?? 0;

    return {
      isReady: Boolean(currentConfig),
      shellGeneration: Number(document.body.dataset.shellGeneration ?? "0"),
      outputFormat: currentConfig?.diff2html.outputFormat,
      colorScheme: currentConfig?.diff2html.colorScheme,
      fileCount: fileBindings.length,
      filePaths: fileBindings.map(({ filePath }) => filePath),
      fileHeaders,
      fileListVisible: Boolean(fileList),
      collapsedFilePaths,
      selectedPath: this.args.getSelectedPath(),
      largeDiffWarning: largeDiffNotice || undefined,
      scrollbarVisible: scrollbar instanceof HTMLElement && scrollbar.style.display === "block",
      inlineHighlightCount,
      lightHighlightDisabled: lightStylesheet instanceof HTMLLinkElement ? lightStylesheet.disabled : false,
      darkHighlightDisabled: darkStylesheet instanceof HTMLLinkElement ? darkStylesheet.disabled : false,
      codeLineTexts,
    };
  }
}
