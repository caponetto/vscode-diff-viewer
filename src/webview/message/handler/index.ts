import { ColorSchemeType, DiffFile } from "diff2html/lib/types";
import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { AppConfig } from "../../../extension/configuration";
import { ViewedState } from "../../../extension/viewed-state";
import { SkeletonElementIds } from "../../../shared/css/elements";
import { extractNumberFromString } from "../../../shared/extract";
import { MessageToExtension, MessageToWebviewHandler } from "../../../shared/message";
import { GenericMessageHandlerImpl } from "../../../shared/message-handler";
import { Diff2HtmlCssClasses } from "../../css/classes";
import { Diff2HtmlCssClassElements } from "../../css/elements";
import { UpdateWebviewPayload, WebviewAction, WebviewUiState } from "../api";
import { getSha1Hash } from "../hash";
import { buildDiffFileMap, buildDiffFileViewModel, buildDiffHashes } from "./models";
import { HorizontalScrollbarController } from "./scrollbar";
import {
  CHANGED_SINCE_VIEWED,
  DEFAULT_UI_STATE,
  DiffFileViewModel,
  FILE_ACTION_BUTTON_CLASS,
  FILE_ACTIONS_CLASS,
  FileDomBinding,
  SELECTED_FILE,
  WebviewStateAdapter,
} from "./types";
import { setupTheme, showEmpty, showLoading, updateFooter, updateHighlightTheme, updateLargeDiffNotice } from "./ui";

export class MessageToWebviewHandlerImpl extends GenericMessageHandlerImpl implements MessageToWebviewHandler {
  private currentConfig: AppConfig | undefined = undefined;
  private accessiblePaths = new Set<string>();
  private currentDiffHashes: Record<string, string> = {};
  private currentUiState: WebviewUiState;
  private currentDiffFilesByPath: Record<string, DiffFile> = {};
  private fileBindings: FileDomBinding[] = [];
  private diffContainerHandlersRegistered = false;
  private readonly horizontalScrollbarController: HorizontalScrollbarController;

  constructor(
    private readonly args: {
      postMessageToExtensionFn: (message: MessageToExtension) => void;
      state: WebviewStateAdapter;
    },
  ) {
    super();
    this.currentUiState = {
      ...DEFAULT_UI_STATE,
      ...this.args.state.getState(),
    };
    this.horizontalScrollbarController = new HorizontalScrollbarController({
      getConfig: () => this.currentConfig,
      getFileBindings: () => this.fileBindings,
    });
  }

  public prepare(): void {
    showLoading(true);
    showEmpty(false);
  }

  public async updateWebview(payload: UpdateWebviewPayload): Promise<void> {
    const diffContainer = document.getElementById(SkeletonElementIds.DiffContainer);
    if (!diffContainer) {
      return;
    }

    await this.withLoading(async () => {
      if (payload.diffFiles.length === 0) {
        showEmpty(true);
      }

      this.currentConfig = payload.config;
      this.accessiblePaths = new Set(payload.accessiblePaths);
      this.currentDiffFilesByPath = buildDiffFileMap(payload.diffFiles, this.accessiblePaths);
      this.currentDiffHashes = await buildDiffHashes({
        payload,
        currentDiffFilesByPath: this.currentDiffFilesByPath,
        accessiblePaths: this.accessiblePaths,
      });

      const appTheme = this.currentConfig.diff2html.colorScheme === ColorSchemeType.DARK ? "dark" : "light";
      setupTheme(appTheme);
      updateHighlightTheme(appTheme);
      updateLargeDiffNotice(payload.performance.warning);

      if (payload.collapseAll) {
        diffContainer.style.display = "none";
      }

      const diff2html = new Diff2HtmlUI(diffContainer, payload.diffFiles, this.currentConfig.diff2html);
      diff2html.draw();

      this.fileBindings = this.enhanceRenderedDiff(diffContainer, payload.diffFiles);
      this.registerDiffContainerHandlers(diffContainer);
      this.horizontalScrollbarController.ensureWindowHandlersRegistered();

      if (payload.collapseAll) {
        if (payload.performance.isLargeDiff) {
          this.setAllCollapsedStates(true);
        } else {
          this.setAllViewedStates(true);
        }
      } else {
        await this.hideViewedFiles(payload.viewedState);
      }

      this.restoreSelection();
      updateFooter(this.fileBindings);

      diffContainer.style.display = "block";
      this.horizontalScrollbarController.refresh();
      this.horizontalScrollbarController.scheduleRefresh();
    });
  }

  public performWebviewAction(payload: { action: WebviewAction }): void {
    switch (payload.action) {
      case "collapseAll":
        this.setAllViewedStates(true);
        this.clearChangedSinceViewedIndicators();
        updateFooter(this.fileBindings);
        this.horizontalScrollbarController.refresh();
        return;
      case "expandAll":
        this.setAllViewedStates(false);
        this.clearChangedSinceViewedIndicators();
        this.persistUiState({ selectedPath: undefined });
        updateFooter(this.fileBindings);
        this.horizontalScrollbarController.refresh();
        return;
      case "showRaw":
        return;
    }
  }

  private registerDiffContainerHandlers(diffContainer: HTMLElement): void {
    if (this.diffContainerHandlersRegistered) {
      return;
    }

    diffContainer.addEventListener("click", this.onDiffClickedHandler.bind(this));
    diffContainer.addEventListener("change", this.onDiffContainerChangedHandler.bind(this));

    this.diffContainerHandlersRegistered = true;
  }

  private onDiffContainerChangedHandler(event: Event): void {
    const viewedToggle = event.target;
    if (!(viewedToggle instanceof HTMLInputElement)) {
      return;
    }

    if (!viewedToggle.matches(Diff2HtmlCssClassElements.Input__ViewedToggle)) {
      return;
    }

    this.onViewedToggleChangedHandler(viewedToggle);
  }

  private onViewedToggleChangedHandler(viewedToggle: HTMLInputElement): void {
    this.updateDiff2HtmlFileCollapsed(viewedToggle, viewedToggle.checked);
    viewedToggle.classList.remove(CHANGED_SINCE_VIEWED);
    this.getViewedToggleLabel(viewedToggle)?.classList.remove(CHANGED_SINCE_VIEWED);
    this.scrollDiffFileHeaderIntoView(viewedToggle);
    this.selectDiffFile(this.getDiffElementFileName(viewedToggle));
    updateFooter(this.fileBindings);
    this.horizontalScrollbarController.refresh();
    void this.sendFileViewedMessage(viewedToggle, viewedToggle.checked);
  }

  private onDiffClickedHandler(event: Event): void {
    const diffElement = event.target;
    if (!(diffElement instanceof HTMLElement)) {
      return;
    }

    const filePath = this.getDiffElementFileName(diffElement);
    if (filePath) {
      this.selectDiffFile(filePath);
    }

    const actionButton = diffElement.closest<HTMLElement>(`button.${FILE_ACTION_BUTTON_CLASS}`);
    const actionPath = actionButton?.dataset.path;
    if (actionPath) {
      this.openFileAtPath(actionPath);
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

    this.openFileAtPath(fileName, lineNumber);
  }

  private openFileAtPath(path: string, line?: number): void {
    this.args.postMessageToExtensionFn({
      kind: "openFile",
      payload: {
        path,
        line,
      },
    });
  }

  private getDiffFileContainer(diffElement: HTMLElement): HTMLElement | null {
    return diffElement.closest(Diff2HtmlCssClassElements.Div__File);
  }

  private getDiffElementFileName(diffElement: HTMLElement): string | undefined {
    const fileContainer = this.getDiffFileContainer(diffElement);
    return fileContainer?.dataset.diffPath;
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
      Diff2HtmlCssClassElements.Div__LineNumberRightOnLineByLine,
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

  private enhanceRenderedDiff(diffContainer: HTMLElement, diffFiles: DiffFile[]): FileDomBinding[] {
    const fileContainers = diffContainer.querySelectorAll<HTMLElement>(Diff2HtmlCssClassElements.Div__File);
    return Array.from(fileContainers).flatMap((fileContainer, index) => {
      const diffFile = diffFiles[index];
      if (!diffFile) {
        return [];
      }

      const viewModel = buildDiffFileViewModel(diffFile, this.accessiblePaths);
      fileContainer.dataset.diffPath = viewModel.primaryPath;
      this.appendFileNavigationActions(fileContainer, viewModel);
      return viewModel.primaryPath
        ? [
            {
              fileContainer,
              filePath: viewModel.primaryPath,
              fileNameText:
                fileContainer.querySelector(Diff2HtmlCssClassElements.A__FileName)?.textContent?.toLowerCase() ?? "",
              viewedToggle:
                fileContainer.querySelector<HTMLInputElement>(Diff2HtmlCssClassElements.Input__ViewedToggle) ??
                undefined,
            },
          ]
        : [];
    });
  }

  private appendFileNavigationActions(fileContainer: HTMLElement, viewModel: DiffFileViewModel): void {
    const header = fileContainer.querySelector<HTMLElement>(Diff2HtmlCssClassElements.Div__DiffFileHeader);
    if (!header) {
      return;
    }

    const actionsContainer = document.createElement("div");
    actionsContainer.className = FILE_ACTIONS_CLASS;

    if (viewModel.oldPath && viewModel.newPath && viewModel.oldPath !== viewModel.newPath) {
      if (viewModel.isOldPathAccessible) {
        actionsContainer.append(this.createFileActionButton("Open old", viewModel.oldPath));
      }
      if (viewModel.isNewPathAccessible) {
        actionsContainer.append(this.createFileActionButton("Open new", viewModel.newPath));
      }
    } else if (viewModel.primaryPath && (viewModel.isNewPathAccessible || viewModel.isOldPathAccessible)) {
      actionsContainer.append(this.createFileActionButton("Open file", viewModel.primaryPath));
    }

    if (actionsContainer.childElementCount > 0) {
      header.append(actionsContainer);
    }
  }

  private createFileActionButton(label: string, path: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = FILE_ACTION_BUTTON_CLASS;
    button.textContent = label;
    button.dataset.path = path;
    button.setAttribute("aria-label", `${label}: ${path}`);
    return button;
  }

  private async hideViewedFiles(viewedState: ViewedState): Promise<void> {
    const togglesToRevisit: Array<{ toggle: HTMLInputElement; oldSha1: string }> = [];
    for (const binding of this.fileBindings) {
      if (binding.viewedToggle && viewedState[binding.filePath]) {
        togglesToRevisit.push({ toggle: binding.viewedToggle, oldSha1: viewedState[binding.filePath] });
        this.updateDiff2HtmlFileCollapsed(binding.viewedToggle, true);
      }
    }

    for (const { toggle, oldSha1 } of togglesToRevisit) {
      const fileName = this.getDiffElementFileName(toggle);
      const diffHash = fileName ? await this.getOrCreateDiffHash(fileName) : null;
      if (diffHash !== oldSha1) {
        this.updateDiff2HtmlFileCollapsed(toggle, false);
        toggle.classList.add(CHANGED_SINCE_VIEWED);
        this.getViewedToggleLabel(toggle)?.classList.add(CHANGED_SINCE_VIEWED);
      }
    }
  }

  private updateDiff2HtmlFileCollapsed(toggleElement: HTMLInputElement, collapse: boolean): void {
    toggleElement.checked = collapse;
    const fileContainer = this.getDiffFileContainer(toggleElement);
    const label = fileContainer?.querySelector(Diff2HtmlCssClassElements.Label__ViewedToggle);
    label?.classList.toggle(Diff2HtmlCssClasses.Input__ViewedToggle__Selected, collapse);
    const fileContent = fileContainer?.querySelector(Diff2HtmlCssClassElements.Div__DiffFileContent);
    fileContent?.classList.toggle(Diff2HtmlCssClasses.Div__DiffFileContent__Collapsed, collapse);
  }

  private setAllViewedStates(viewed: boolean): void {
    const allToggles = this.getViewedToggles();

    for (const toggle of Array.from(allToggles)) {
      this.updateDiff2HtmlFileCollapsed(toggle, viewed);
      toggle.classList.remove(CHANGED_SINCE_VIEWED);
      this.getViewedToggleLabel(toggle)?.classList.remove(CHANGED_SINCE_VIEWED);
      void this.sendFileViewedMessage(toggle, viewed);
    }
  }

  private setAllCollapsedStates(collapse: boolean): void {
    for (const toggle of this.getViewedToggles()) {
      this.updateDiff2HtmlFileCollapsed(toggle, collapse);
      toggle.classList.remove(CHANGED_SINCE_VIEWED);
    }
  }

  private async sendFileViewedMessage(diffElement: HTMLInputElement, viewed: boolean): Promise<void> {
    const fileName = this.getDiffElementFileName(diffElement);
    if (!fileName) {
      return;
    }

    const viewedSha1 = viewed ? await this.getOrCreateDiffHash(fileName) : null;

    this.args.postMessageToExtensionFn({
      kind: "toggleFileViewed",
      payload: {
        path: fileName,
        viewedSha1,
      },
    });
  }

  private async getOrCreateDiffHash(fileName: string): Promise<string | null> {
    const cachedHash = this.currentDiffHashes[fileName];
    if (cachedHash) {
      return cachedHash;
    }

    const diffFile = this.currentDiffFilesByPath[fileName];
    if (!diffFile) {
      return null;
    }

    const hash = await getSha1Hash(JSON.stringify(diffFile));
    this.currentDiffHashes[fileName] = hash;
    return hash;
  }

  private restoreSelection(): void {
    if (!this.currentUiState.selectedPath) {
      return;
    }

    this.selectDiffFile(this.currentUiState.selectedPath);
  }

  private selectDiffFile(path?: string): void {
    this.fileBindings.forEach(({ fileContainer }) => {
      fileContainer.classList.remove(SELECTED_FILE);
    });

    if (!path) {
      this.persistUiState({ selectedPath: undefined });
      return;
    }

    const selectedBinding = this.fileBindings.find((binding) => binding.filePath === path);
    if (!selectedBinding) {
      return;
    }

    selectedBinding.fileContainer.classList.add(SELECTED_FILE);
    this.persistUiState({ selectedPath: path });
  }

  private persistUiState(patch: Partial<WebviewUiState>): void {
    this.currentUiState = {
      ...this.currentUiState,
      ...patch,
    };
    this.args.state.setState(this.currentUiState);
  }

  private scrollDiffFileHeaderIntoView(viewedToggle: HTMLInputElement): void {
    const diffFileHeader = viewedToggle.closest(Diff2HtmlCssClassElements.Div__DiffFileHeader);
    if (!diffFileHeader) {
      return;
    }

    diffFileHeader.scrollIntoView({ block: "nearest" });
  }

  private clearChangedSinceViewedIndicators(): void {
    this.getViewedToggles().forEach((toggle) => {
      toggle.classList.remove(CHANGED_SINCE_VIEWED);
      this.getViewedToggleLabel(toggle)?.classList.remove(CHANGED_SINCE_VIEWED);
    });
  }

  private getViewedToggles(): HTMLInputElement[] {
    return this.fileBindings.flatMap(({ viewedToggle }) => (viewedToggle ? [viewedToggle] : []));
  }

  private getViewedToggleLabel(toggle: HTMLInputElement): HTMLElement | null {
    return toggle.closest(Diff2HtmlCssClassElements.Label__ViewedToggle);
  }

  private async withLoading(runnable: () => Promise<void>): Promise<void> {
    showLoading(true);
    showEmpty(false);

    await runnable();

    showLoading(false);
  }
}
