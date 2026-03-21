import { ColorSchemeType, DiffFile } from "diff2html/lib/types";
import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { AppConfig } from "../../extension/configuration";
import { ViewedState } from "../../extension/viewed-state";
import { CssPropertiesBasedOnTheme, SkeletonElementIds } from "../../shared/css/elements";
import { extractNewFileNameFromDiffName, extractNumberFromString } from "../../shared/extract";
import { MessageToExtension, MessageToWebviewHandler } from "../../shared/message";
import { GenericMessageHandlerImpl } from "../../shared/message-handler";
import { AppTheme } from "../../shared/types";
import { Diff2HtmlCssClasses } from "../css/classes";
import { Diff2HtmlCssClassElements } from "../css/elements";
import { UpdateWebviewPayload, WebviewAction, WebviewUiState } from "./api";
import { getSha1Hash } from "./hash";

const CHANGED_SINCE_VIEWED = "changed-since-last-view";
const SELECTED_FILE = "selected-file";
const FILE_ACTIONS_CLASS = "diff-viewer-file-actions";
const FILE_ACTION_BUTTON_CLASS = "diff-viewer-file-action-button";
const DEFAULT_UI_STATE: WebviewUiState = { scrollTop: 0 };

interface FileDomBinding {
  fileContainer: HTMLElement;
  filePath: string;
  fileNameText: string;
  viewedToggle?: HTMLInputElement;
}

interface DiffFileViewModel {
  primaryPath: string;
  oldPath?: string;
  newPath?: string;
  isOldPathAccessible: boolean;
  isNewPathAccessible: boolean;
}

interface WebviewStateAdapter {
  getState: () => WebviewUiState | undefined;
  setState: (state: WebviewUiState) => void;
}

export class MessageToWebviewHandlerImpl extends GenericMessageHandlerImpl implements MessageToWebviewHandler {
  private currentConfig: AppConfig | undefined = undefined;
  private accessiblePaths = new Set<string>();
  private currentDiffHashes: Record<string, string> = {};
  private currentUiState: WebviewUiState;
  private currentDiffFilesByPath: Record<string, DiffFile> = {};
  private fileBindings: FileDomBinding[] = [];
  private diffContainerHandlersRegistered = false;

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
  }

  public prepare(): void {
    this.showLoading(true);
    this.showEmpty(false);
  }

  public ping(): void {
    this.args.postMessageToExtensionFn({ kind: "pong" });
  }

  public async updateWebview(payload: UpdateWebviewPayload): Promise<void> {
    const diffContainer = document.getElementById(SkeletonElementIds.DiffContainer);
    if (!diffContainer) {
      return;
    }

    await this.withLoading(async () => {
      if (payload.diffFiles.length === 0) {
        this.showEmpty(true);
      }

      this.currentConfig = payload.config;
      this.accessiblePaths = new Set(payload.accessiblePaths);
      this.currentDiffFilesByPath = this.buildDiffFileMap(payload.diffFiles);
      this.currentDiffHashes = await this.buildDiffHashes(payload);

      const appTheme = this.currentConfig.diff2html.colorScheme === ColorSchemeType.DARK ? "dark" : "light";
      this.setupTheme(appTheme);
      this.updateHighlightTheme(appTheme);
      this.updateLargeDiffNotice(payload.performance.warning);

      if (payload.collapseAll) {
        diffContainer.style.display = "none";
      }

      const diff2html = new Diff2HtmlUI(diffContainer, payload.diffFiles, this.currentConfig.diff2html);
      diff2html.draw();

      this.fileBindings = this.enhanceRenderedDiff(diffContainer, payload.diffFiles);
      this.registerDiffContainerHandlers(diffContainer);

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
      this.updateFooter();

      diffContainer.style.display = "block";
    });
  }

  public performWebviewAction(payload: { action: WebviewAction }): void {
    switch (payload.action) {
      case "collapseAll":
        this.setAllViewedStates(true);
        this.clearChangedSinceViewedIndicators();
        this.updateFooter();
        return;
      case "expandAll":
        this.setAllViewedStates(false);
        this.clearChangedSinceViewedIndicators();
        this.persistUiState({ selectedPath: undefined });
        this.updateFooter();
        return;
      case "showRaw":
        return;
    }
  }

  private setupTheme(theme: AppTheme): void {
    const root = document.documentElement;

    CssPropertiesBasedOnTheme.forEach((property) => {
      const value = getComputedStyle(root).getPropertyValue(`${property}--${theme}`);
      root.style.setProperty(property, value);
    });
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
    viewedToggle.classList.remove(CHANGED_SINCE_VIEWED);
    this.getViewedToggleLabel(viewedToggle)?.classList.remove(CHANGED_SINCE_VIEWED);
    this.scrollDiffFileHeaderIntoView(viewedToggle);
    this.selectDiffFile(this.getDiffElementFileName(viewedToggle));
    this.updateFooter();
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

      const viewModel = this.buildDiffFileViewModel(diffFile);
      fileContainer.dataset.diffPath = viewModel.primaryPath;
      this.appendFileNavigationActions(fileContainer, viewModel);
      return viewModel.primaryPath
        ? [
            {
              fileContainer,
              filePath: viewModel.primaryPath,
              fileNameText:
                fileContainer.querySelector(Diff2HtmlCssClassElements.A__FileName)?.textContent?.toLocaleLowerCase() ??
                "",
              viewedToggle:
                fileContainer.querySelector<HTMLInputElement>(Diff2HtmlCssClassElements.Input__ViewedToggle) ??
                undefined,
            },
          ]
        : [];
    });
  }

  private buildDiffFileViewModel(diffFile: DiffFile): DiffFileViewModel {
    const oldPath = this.normalizeDiffFilePath(diffFile.oldName);
    const newPath = this.normalizeDiffFilePath(diffFile.newName);
    const primaryPath = newPath ?? oldPath ?? "";

    return {
      primaryPath,
      oldPath,
      newPath,
      isOldPathAccessible: oldPath ? this.accessiblePaths.has(oldPath) : false,
      isNewPathAccessible: newPath ? this.accessiblePaths.has(newPath) : false,
    };
  }

  private normalizeDiffFilePath(path?: string): string | undefined {
    if (!path || path === "/dev/null") {
      return;
    }

    const normalizedPath = extractNewFileNameFromDiffName(path);
    return normalizedPath === "/dev/null" ? undefined : normalizedPath;
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

  private async buildDiffHashes(payload: UpdateWebviewPayload): Promise<Record<string, string>> {
    const targetPaths = payload.performance.deferViewedStateHashing
      ? Object.keys(payload.viewedState)
      : payload.diffFiles
          .map((diffFile) => this.buildDiffFileViewModel(diffFile).primaryPath)
          .filter((filePath): filePath is string => filePath.length > 0);

    const entries = await Promise.all(
      targetPaths.map(async (fileName) => {
        if (!fileName) {
          return undefined;
        }

        const diffFile = this.currentDiffFilesByPath[fileName];
        if (!diffFile) {
          return undefined;
        }

        return [fileName, await getSha1Hash(JSON.stringify(diffFile))] as const;
      }),
    );

    return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
  }

  private buildDiffFileMap(diffFiles: DiffFile[]): Record<string, DiffFile> {
    return Object.fromEntries(
      diffFiles.flatMap((diffFile) => {
        const filePath = this.buildDiffFileViewModel(diffFile).primaryPath;
        return filePath ? [[filePath, diffFile] as const] : [];
      }),
    );
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

  private getAllFileBindings(): FileDomBinding[] {
    return this.fileBindings;
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

  private getViewedCount(): number {
    return this.fileBindings.reduce((count, { viewedToggle }) => count + (viewedToggle?.checked ? 1 : 0), 0);
  }

  private updateFooter(): void {
    const indicator = document.getElementById(SkeletonElementIds.ViewedIndicator);
    if (!indicator) {
      return;
    }

    const allCount = this.fileBindings.length;
    if (allCount === 0) {
      return;
    }

    const viewedCount = this.getViewedCount();
    indicator.textContent = `${viewedCount} / ${allCount} files viewed`;

    const viewedProgressContainer = document.getElementById(SkeletonElementIds.ViewedProgressContainer);
    if (viewedProgressContainer instanceof HTMLProgressElement) {
      viewedProgressContainer.value = Math.round((viewedCount / allCount) * 100);
    }
  }

  private async withLoading(runnable: () => Promise<void>): Promise<void> {
    this.showLoading(true);
    this.showEmpty(false);

    await runnable();

    this.showLoading(false);
  }

  private showLoading(isLoading: boolean): void {
    const loadingContainer = document.getElementById(SkeletonElementIds.LoadingContainer);
    if (!loadingContainer) {
      return;
    }

    loadingContainer.style.display = isLoading ? "block" : "none";
  }

  private showEmpty(isEmpty: boolean): void {
    const emptyMessageContainer = document.getElementById(SkeletonElementIds.EmptyMessageContainer);
    if (!emptyMessageContainer) {
      return;
    }

    emptyMessageContainer.style.display = isEmpty ? "block" : "none";
  }

  private updateLargeDiffNotice(warning?: string): void {
    const notice = document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer);
    if (!notice) {
      return;
    }

    notice.textContent = warning ?? "";
    notice.style.display = warning ? "block" : "none";
  }

  private updateHighlightTheme(theme: AppTheme): void {
    const lightStylesheet = document.getElementById(SkeletonElementIds.HighlightLightStylesheet);
    const darkStylesheet = document.getElementById(SkeletonElementIds.HighlightDarkStylesheet);
    if (!(lightStylesheet instanceof HTMLLinkElement) || !(darkStylesheet instanceof HTMLLinkElement)) {
      return;
    }

    lightStylesheet.disabled = theme === "dark";
    darkStylesheet.disabled = theme !== "dark";
  }
}
