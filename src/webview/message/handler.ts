import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { AppConfig } from "../../extension/configuration";
import { ViewedState } from "../../extension/viewed-state";
import { SkeletonElementIds } from "../../shared/css/elements";
import { extractNewFileNameFromDiffName, extractNumberFromString } from "../../shared/extract";
import { MessageToExtension, MessageToWebview, MessageToWebviewHandler } from "../../shared/message";
import { Diff2HtmlCssClassElements } from "../css/elements";
import { UpdateWebviewPayload } from "./api";
import { getSha1Hash } from "./hash";

const CHANGED_SINCE_VIEWED = "changed-since-last-view";

export class MessageToWebviewHandlerImpl implements MessageToWebviewHandler {
  private currentConfig: AppConfig | undefined = undefined;

  constructor(private readonly postMessageToExtensionFn: (message: MessageToExtension) => void) {}

  public onMessageReceived(message: MessageToWebview): void {
    if ("payload" in message) {
      this[message.kind](message.payload);
    } else {
      this[message.kind]();
    }
  }

  public prepare(): void {
    this.showLoading(true);
  }

  public ping(): void {
    console.info("Webview ping!");
    this.postMessageToExtensionFn({ kind: "pong" });
  }

  public async updateWebview(payload: UpdateWebviewPayload): Promise<void> {
    const diffContainer = document.getElementById(payload.diffContainer);
    if (!diffContainer) {
      return;
    }

    await this.withLoading(async () => {
      this.currentConfig = payload.config;

      new Diff2HtmlUI(diffContainer, payload.diffFiles, this.currentConfig.diff2html).draw();

      this.registerViewedToggleHandlers(diffContainer);
      this.registerDiffContainerHandlers(diffContainer);
      await this.hideViewedFiles(diffContainer, payload.viewedState);
      this.updateFooter();
    });
  }

  private registerViewedToggleHandlers(diffContainer: HTMLElement): void {
    const viewedToggles = diffContainer.querySelectorAll<HTMLInputElement>(
      Diff2HtmlCssClassElements.Input__ViewedToggle
    );

    viewedToggles.forEach((element) => {
      element.addEventListener("change", this.onViewedToggleChangedHandler.bind(this));
    });
  }

  private onViewedToggleChangedHandler(event: Event): void {
    const viewedToggle = event.target as HTMLInputElement;
    if (!viewedToggle) {
      return;
    }

    viewedToggle.classList.remove(CHANGED_SINCE_VIEWED);
    this.scrollDiffFileHeaderIntoView(viewedToggle);
    this.updateFooter();
    this.sendFileViewedMessage(viewedToggle);
  }

  private scrollDiffFileHeaderIntoView(viewedToggle: HTMLInputElement): void {
    const diffFileHeader = viewedToggle.closest(Diff2HtmlCssClassElements.Div__DiffFileHeader);
    if (!diffFileHeader) {
      return;
    }

    diffFileHeader.scrollIntoView({ block: "nearest" });
  }

  private updateFooter(): void {
    const footer = document.querySelector("footer");
    if (!footer) {
      return;
    }

    const allCount = document.querySelectorAll(Diff2HtmlCssClassElements.Input__ViewedToggle).length;
    if (allCount === 0) {
      return;
    }

    const viewedCount = document.querySelectorAll(Diff2HtmlCssClassElements.Input__ViewedToggle__Checked).length;
    footer.textContent = `${viewedCount} / ${allCount} files viewed`;
  }

  private registerDiffContainerHandlers(diffContainer: HTMLElement): void {
    diffContainer.addEventListener("click", this.onDiffClickedHandler.bind(this));
  }

  private onDiffClickedHandler(event: Event): void {
    const diffElement = event.target as HTMLElement;
    if (!diffElement) {
      return;
    }

    this.maybeOpenFile(diffElement);
  }

  private maybeOpenFile(diffElement: HTMLElement): void {
    const fileName = this.getDiffElementFileName(diffElement);
    if (!fileName) {
      return;
    }

    const lineNumber = this.getClickedLineNumber(diffElement);
    const ignoreOtherClicks = !lineNumber && !diffElement.closest(Diff2HtmlCssClassElements.A__FileName);
    if (ignoreOtherClicks) {
      return;
    }

    this.postMessageToExtensionFn({
      kind: "openFile",
      payload: {
        path: fileName,
        line: lineNumber,
      },
    });
  }

  private getDiffFileContainer(diffElement: HTMLElement): HTMLElement | null {
    return diffElement.closest(Diff2HtmlCssClassElements.Div__File);
  }

  private getDiffElementFileName(diffElement: HTMLElement): string | undefined {
    const fileContainer = this.getDiffFileContainer(diffElement);
    const fileNameValue = fileContainer?.querySelector(Diff2HtmlCssClassElements.A__FileName)?.textContent;
    if (!fileNameValue) {
      return;
    }

    return extractNewFileNameFromDiffName(fileNameValue);
  }

  private getClickedLineNumber(diffElement: HTMLElement): number | undefined {
    if (!this.currentConfig) {
      return;
    }

    return this.currentConfig.diff2html.outputFormat === "line-by-line"
      ? this.getClickedLineNumberOnLineByLine(diffElement)
      : this.getClickedLineNumberOnSideBySide(diffElement);
  }

  private getClickedLineNumberOnLineByLine(diffElement: HTMLElement): number | undefined {
    const lineNumberElement = diffElement.closest(Diff2HtmlCssClassElements.Td__LineNumberOnLineByLine);
    if (!lineNumberElement) {
      return;
    }

    const blockList = [Diff2HtmlCssClassElements.Td__DeletedLine, Diff2HtmlCssClassElements.Td__DiffInfo];
    if (blockList.some((item) => lineNumberElement.matches(item))) {
      return;
    }

    const lineNumberValue = lineNumberElement.querySelector(
      Diff2HtmlCssClassElements.Div__LineNumberRightOnLineByLine
    )?.textContent;
    if (!lineNumberValue) {
      return;
    }

    return extractNumberFromString(lineNumberValue);
  }

  private getClickedLineNumberOnSideBySide(diffElement: HTMLElement): number | undefined {
    const lineNumberElement = diffElement.closest(Diff2HtmlCssClassElements.Td__LineNumberOnSideBySide);
    if (!lineNumberElement?.textContent) {
      return;
    }

    if (lineNumberElement.closest(Diff2HtmlCssClassElements.Div__LeftDiffOnSideBySide__FirstChild)) {
      return;
    }

    return extractNumberFromString(lineNumberElement.textContent);
  }

  private async hideViewedFiles(diffContainer: HTMLElement, viewedState: ViewedState) {
    const viewedToggles = diffContainer.querySelectorAll<HTMLInputElement>(
      Diff2HtmlCssClassElements.Input__ViewedToggle
    );
    for (const toggle of Array.from(viewedToggles)) {
      const fileName = this.getDiffElementFileName(toggle);
      if (fileName && viewedState[fileName]) {
        const diffHash = await this.getDiffHash(toggle);
        if (diffHash === viewedState[fileName]) {
          toggle.click();
        } else {
          toggle.classList.add(CHANGED_SINCE_VIEWED);
        }
      }
    }
  }

  private async getDiffHash(diffElement: HTMLElement): Promise<string | null> {
    const fileContainer = this.getDiffFileContainer(diffElement);
    const fileContent = fileContainer?.querySelector(Diff2HtmlCssClassElements.Div__DiffFileContent)?.innerHTML;
    return fileContent ? getSha1Hash(fileContent) : null;
  }

  private async sendFileViewedMessage(toggleElement: HTMLInputElement): Promise<void> {
    const fileName = this.getDiffElementFileName(toggleElement);
    if (!fileName) {
      return;
    }

    const viewedSha1 = toggleElement.checked ? await this.getDiffHash(toggleElement) : null;

    this.postMessageToExtensionFn({
      kind: "toggleFileViewed",
      payload: {
        path: fileName,
        viewedSha1,
      },
    });
  }

  private async withLoading(runnable: () => Promise<void>): Promise<void> {
    this.showLoading(true);

    await runnable();

    this.showLoading(false);
  }

  private showLoading(isVisible: boolean): void {
    const loadingContainer = document.getElementById(SkeletonElementIds.LoadingContainer);
    if (!loadingContainer) {
      return;
    }

    loadingContainer.style.display = isVisible ? "block" : "none";
  }
}
