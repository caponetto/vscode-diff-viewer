import { parse } from "diff2html";
import * as vscode from "vscode";
import { isMessageToExtension, MessageToExtensionHandler, MessageToWebview } from "../../shared/message";
import { getPathBaseName } from "../../shared/path";
import { APP_CONFIG_SECTION, extractConfig, isAutoColorScheme, setOutputFormatConfig } from "../configuration";
import { MessageToExtensionHandlerImpl } from "../message/handler";
import { ViewedStateStore } from "../viewed-state";
import { WebviewAction } from "../../webview/message/api";
import { collectAccessiblePaths, clearAccessiblePathsCache } from "./paths";
import { createRenderPlan, isActiveRenderRequest } from "./rendering";
import { ensureWebviewShell } from "./shell";
import { DiffViewerProviderArgs, RenderedWebviewData, WebviewContext } from "./types";

export class DiffViewerProvider implements vscode.CustomTextEditorProvider {
  private static readonly VIEW_TYPE = "diffViewer";
  private activeWebviewContext: WebviewContext | undefined;
  private readonly webviewContexts = new Set<WebviewContext>();

  public constructor(private readonly args: DiffViewerProviderArgs) {}

  public static registerContributions(args: DiffViewerProviderArgs): vscode.Disposable[] {
    const provider = new DiffViewerProvider(args);

    return [
      vscode.window.registerCustomEditorProvider(DiffViewerProvider.VIEW_TYPE, provider, {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }),
      vscode.commands.registerCommand("diffviewer.showLineByLine", () => setOutputFormatConfig("line-by-line")),
      vscode.commands.registerCommand("diffviewer.showSideBySide", () => setOutputFormatConfig("side-by-side")),
      vscode.commands.registerCommand("diffviewer.expandAll", () => provider.performWebviewAction("expandAll")),
      vscode.commands.registerCommand("diffviewer.collapseAll", () => provider.performWebviewAction("collapseAll")),
      vscode.commands.registerCommand("diffviewer.showRaw", () => provider.performWebviewAction("showRaw")),
      vscode.commands.registerCommand("diffviewer.openCollapsed", async (file) => {
        if (file) {
          const collapsedUri = file.with({ query: "collapsed" });
          await vscode.commands.executeCommand("vscode.openWith", collapsedUri, "diffViewer");
        }
      }),
    ];
  }

  public async resolveCustomTextEditor(
    diffDocument: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return;
    }

    if (this.isDocumentShownInTextDiff(diffDocument.uri)) {
      webviewPanel.dispose();
      await vscode.commands.executeCommand("vscode.openWith", diffDocument.uri, "default");
      return;
    }

    this.postMessageToWebviewWrapper({
      webview: webviewPanel.webview,
      message: {
        kind: "ping",
      },
    });

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const viewedStateStore = new ViewedStateStore({
      context: this.args.extensionContext,
      docId: diffDocument.uri.fsPath,
    });

    const collapseAll = new URLSearchParams(diffDocument.uri.query).has("collapsed");

    const webviewContext = this.createWebviewContext({
      diffDocument,
      webviewPanel,
      viewedStateStore,
    });

    const messageReceivedHandler = this.createMessageHandler({
      diffDocument,
      viewedStateStore,
      webviewPanel,
      webviewContext,
    });

    this.webviewContexts.add(webviewContext);
    if (webviewPanel.active) {
      this.activeWebviewContext = webviewContext;
    }

    this.registerEventHandlers({ webviewContext, messageHandler: messageReceivedHandler });
    this.updateWebview(webviewContext, collapseAll);
  }

  private registerEventHandlers(args: { webviewContext: WebviewContext; messageHandler: MessageToExtensionHandler }) {
    const disposables = vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.fsPath !== args.webviewContext.document.uri.fsPath) {
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
      args.webviewContext.panel.webview.onDidReceiveMessage((m: unknown) => {
        if (!isMessageToExtension(m)) {
          return;
        }

        try {
          args.messageHandler.onMessageReceived(m);
        } catch {
          // ignore malformed or unknown messages from the webview
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(APP_CONFIG_SECTION)) {
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidCreateFiles(() => {
        clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidDeleteFiles(() => {
        clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidRenameFiles(() => {
        clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        if (!isAutoColorScheme() || !args.webviewContext.panel.visible || !this.hasThemeChanged(args.webviewContext)) {
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
      vscode.window.tabGroups.onDidChangeTabs(() => {
        if (args.webviewContext.isDisposed) {
          return;
        }

        if (this.isDocumentShownInTextDiff(args.webviewContext.document.uri)) {
          this.openWithDefaultEditor(args.webviewContext);
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
      args.webviewContext.panel.onDidChangeViewState((event: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
        if (event.webviewPanel.active) {
          this.activeWebviewContext = args.webviewContext;
        }

        if (!event.webviewPanel.visible || !isAutoColorScheme() || !this.hasThemeChanged(args.webviewContext)) {
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
    );

    args.webviewContext.panel.onDidDispose(() => {
      this.webviewContexts.delete(args.webviewContext);
      if (this.activeWebviewContext === args.webviewContext) {
        this.activeWebviewContext = this.getTargetWebviewContext();
      }
      args.webviewContext.isDisposed = true;
      if (args.webviewContext.pendingRender) {
        clearTimeout(args.webviewContext.pendingRender);
      }
      disposables.dispose();
    });
  }

  private createWebviewContext(args: {
    diffDocument: vscode.TextDocument;
    webviewPanel: vscode.WebviewPanel;
    viewedStateStore: ViewedStateStore;
  }): WebviewContext {
    return {
      document: args.diffDocument,
      panel: args.webviewPanel,
      viewedStateStore: args.viewedStateStore,
      isDisposed: false,
      renderRequestId: 0,
      shellInitialized: false,
    };
  }

  private createMessageHandler(args: {
    diffDocument: vscode.TextDocument;
    viewedStateStore: ViewedStateStore;
    webviewPanel: vscode.WebviewPanel;
    webviewContext: WebviewContext;
  }): MessageToExtensionHandler {
    return new MessageToExtensionHandlerImpl({
      diffDocument: args.diffDocument,
      viewedStateStore: args.viewedStateStore,
      postMessageToWebviewFn: (message: MessageToWebview) => {
        this.postMessageToWebviewWrapper({ webview: args.webviewPanel.webview, message });
      },
      onWebviewActionRequested: (action) => {
        this.performWebviewAction(action, args.webviewContext);
      },
    });
  }

  private updateWebview(webviewContext: WebviewContext, collapseAll = false): void {
    const requestId = ++webviewContext.renderRequestId;
    if (webviewContext.pendingRender) {
      clearTimeout(webviewContext.pendingRender);
    }

    this.prepareWebviewForRender(webviewContext);

    const config = extractConfig();
    webviewContext.lastRenderedColorScheme = config.diff2html.colorScheme;
    ensureWebviewShell({
      providerArgs: this.args,
      webviewContext,
    });

    webviewContext.pendingRender = setTimeout(() => {
      void this.renderWebview({
        webviewContext,
        requestId,
        config,
        collapseAll,
      });
    }, 100);
  }

  private async renderWebview(args: {
    webviewContext: WebviewContext;
    requestId: number;
    config: ReturnType<typeof extractConfig>;
    collapseAll: boolean;
  }): Promise<void> {
    if (!isActiveRenderRequest(args)) {
      return;
    }

    try {
      const renderedData = await this.createRenderedWebviewData(args);
      if (!renderedData || !isActiveRenderRequest(args)) {
        return;
      }

      this.postUpdateWebviewMessage({
        webviewContext: args.webviewContext,
        renderedData,
      });
    } catch {
      this.handleWebviewRenderFailure(args.webviewContext);
    }
  }

  private async createRenderedWebviewData(args: {
    webviewContext: WebviewContext;
    requestId: number;
    config: ReturnType<typeof extractConfig>;
    collapseAll: boolean;
  }): Promise<RenderedWebviewData | undefined> {
    const text = args.webviewContext.document.getText();
    const diffFiles = parse(text, args.config.diff2html);
    const renderPlan = createRenderPlan({
      requestedConfig: args.config,
      text,
      diffFiles,
      collapseAll: args.collapseAll,
    });

    if (!isActiveRenderRequest(args)) {
      return;
    }

    if (diffFiles.length === 0 && text.trim() !== "") {
      this.handleMissingDiffStructure(args.webviewContext);
      return;
    }

    return {
      diffFiles,
      viewedState: args.webviewContext.viewedStateStore.getViewedState(),
      accessiblePaths: await collectAccessiblePaths({
        webviewContext: args.webviewContext,
        diffFiles,
      }),
      renderPlan,
    };
  }

  private postUpdateWebviewMessage(args: { webviewContext: WebviewContext; renderedData: RenderedWebviewData }): void {
    this.postMessageToWebviewWrapper({
      webview: args.webviewContext.panel.webview,
      message: {
        kind: "updateWebview",
        payload: {
          config: args.renderedData.renderPlan.config,
          diffFiles: args.renderedData.diffFiles,
          accessiblePaths: args.renderedData.accessiblePaths,
          viewedState: args.renderedData.viewedState,
          collapseAll: args.renderedData.renderPlan.collapseAll,
          performance: args.renderedData.renderPlan.performance,
        },
      },
    });
  }

  private handleMissingDiffStructure(webviewContext: WebviewContext): void {
    webviewContext.panel.dispose();
    vscode.window.showWarningMessage(
      `No diff structure found in the file "${getPathBaseName(webviewContext.document.fileName)}".`,
    );
    this.openDocumentWithDefaultEditor(webviewContext.document.uri);
  }

  private handleWebviewRenderFailure(webviewContext: WebviewContext): void {
    webviewContext.panel.dispose();
    vscode.window.showWarningMessage(
      `Unable to render "${getPathBaseName(webviewContext.document.fileName)}" as a diff.`,
    );
    this.openDocumentWithDefaultEditor(webviewContext.document.uri);
  }

  private prepareWebviewForRender(webviewContext: WebviewContext): void {
    this.postMessageToWebviewWrapper({
      webview: webviewContext.panel.webview,
      message: {
        kind: "prepare",
      },
    });
  }

  private postMessageToWebviewWrapper(args: { webview: vscode.Webview; message: MessageToWebview }): void {
    args.webview.postMessage(args.message);
  }

  private isDocumentShownInTextDiff(uri: vscode.Uri): boolean {
    return vscode.window.tabGroups.all.some((group) =>
      group.tabs.some((tab) => {
        const input = tab.input;
        return (
          input instanceof vscode.TabInputTextDiff &&
          (this.isSameResource(input.original, uri) || this.isSameResource(input.modified, uri))
        );
      }),
    );
  }

  private isSameResource(left: vscode.Uri, right: vscode.Uri): boolean {
    return left.toString() === right.toString();
  }

  private hasThemeChanged(webviewContext: WebviewContext): boolean {
    return webviewContext.lastRenderedColorScheme !== extractConfig().diff2html.colorScheme;
  }

  private openWithDefaultEditor(webviewContext: WebviewContext): void {
    webviewContext.panel.dispose();
    this.openDocumentWithDefaultEditor(webviewContext.document.uri);
  }

  private openDocumentWithDefaultEditor(uri: vscode.Uri): void {
    void vscode.commands.executeCommand("vscode.openWith", uri, "default");
  }

  private getTargetWebviewContext(): WebviewContext | undefined {
    if (this.activeWebviewContext && !this.activeWebviewContext.isDisposed) {
      return this.activeWebviewContext;
    }

    return Array.from(this.webviewContexts).find((context) => context.panel.active || context.panel.visible);
  }

  private performWebviewAction(action: WebviewAction, targetContext = this.getTargetWebviewContext()): void {
    if (!targetContext) {
      return;
    }

    if (action === "showRaw") {
      void vscode.commands.executeCommand("vscode.openWith", targetContext.document.uri, "default");
      return;
    }

    if (action === "expandAll") {
      targetContext.viewedStateStore.clearViewedState();
    }

    this.postMessageToWebviewWrapper({
      webview: targetContext.panel.webview,
      message: {
        kind: "performWebviewAction",
        payload: { action },
      },
    });
  }
}
