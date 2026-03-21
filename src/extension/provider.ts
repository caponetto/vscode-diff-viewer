import { parse } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import * as vscode from "vscode";
import { extractNewFileNameFromDiffName } from "../shared/extract";
import { isMessageToExtension, MessageToExtensionHandler, MessageToWebview } from "../shared/message";
import { getPathBaseName } from "../shared/path";
import {
  APP_CONFIG_SECTION,
  AppConfig,
  extractConfig,
  isAutoColorScheme,
  setOutputFormatConfig,
} from "./configuration";
import { MessageToExtensionHandlerImpl } from "./message/handler";
import { resolveAccessibleUri } from "./path-resolution";
import { buildSkeleton } from "./skeleton";
import { ViewedStateStore } from "./viewed-state";
import { WebviewAction } from "../webview/message/api";
import {
  APP_CSS_FILE_NAME,
  DIFF2HTML_DEP_CSS_FILE_NAME,
  DIFF2HTML_TWEAKS_CSS_FILE_NAME,
  HIGHLIGHT_JS_DEP_CSS_FILE_NAME,
  RESET_CSS_FILE_NAME,
  STYLES_FOLDER_NAME,
} from "../shared/css/files";

interface DiffViewerProviderArgs {
  extensionContext: vscode.ExtensionContext;
  webviewPath: string;
}

interface WebviewContext {
  document: vscode.TextDocument;
  viewedStateStore: ViewedStateStore;
  panel: vscode.WebviewPanel;
  isDisposed: boolean;
  renderRequestId: number;
  shellInitialized: boolean;
  lastRenderedColorScheme?: ColorSchemeType;
  pendingRender?: ReturnType<typeof setTimeout>;
  accessiblePathsCacheKey?: string;
  accessiblePathsCache?: string[];
}

interface ResolvedCssUris {
  commonCssUris: vscode.Uri[];
  lightHighlightCssUri: vscode.Uri;
  darkHighlightCssUri: vscode.Uri;
}

interface WebviewRenderPlan {
  collapseAll: boolean;
  performance: {
    isLargeDiff: boolean;
    warning?: string;
    deferViewedStateHashing: boolean;
  };
  config: AppConfig;
}

const LARGE_DIFF_TEXT_THRESHOLD = 512_000;
const LARGE_DIFF_FILE_THRESHOLD = 150;

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
      args.webviewContext.panel.webview.onDidReceiveMessage((m) => {
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
        this.clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidCreateFiles(() => {
        this.clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidDeleteFiles(() => {
        this.clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.workspace.onDidRenameFiles(() => {
        this.clearAccessiblePathsCache(args.webviewContext);
        this.updateWebview(args.webviewContext);
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        if (!isAutoColorScheme() || !args.webviewContext.panel.visible || !this.hasThemeChanged(args.webviewContext)) {
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
      args.webviewContext.panel.onDidChangeViewState((event) => {
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
    this.ensureWebviewShell(webviewContext);

    webviewContext.pendingRender = setTimeout(async () => {
      if (webviewContext.isDisposed || requestId !== webviewContext.renderRequestId) {
        return;
      }

      try {
        const text = webviewContext.document.getText();
        const diffFiles = parse(text, config.diff2html);
        const renderPlan = this.createRenderPlan({
          requestedConfig: config,
          text,
          diffFiles,
          collapseAll,
        });

        if (webviewContext.isDisposed || requestId !== webviewContext.renderRequestId) {
          return;
        }

        if (diffFiles.length === 0 && text.trim() !== "") {
          webviewContext.panel.dispose();
          vscode.window.showWarningMessage(
            `No diff structure found in the file "${getPathBaseName(webviewContext.document.fileName)}".`,
          );
          void vscode.commands.executeCommand("vscode.openWith", webviewContext.document.uri, "default");
          return;
        }

        const viewedState = webviewContext.viewedStateStore.getViewedState();
        const accessiblePaths = await this.collectAccessiblePaths({
          webviewContext,
          diffFiles,
        });

        if (webviewContext.isDisposed || requestId !== webviewContext.renderRequestId) {
          return;
        }

        this.postMessageToWebviewWrapper({
          webview: webviewContext.panel.webview,
          message: {
            kind: "updateWebview",
            payload: {
              config: renderPlan.config,
              diffFiles,
              accessiblePaths,
              viewedState,
              collapseAll: renderPlan.collapseAll,
              performance: renderPlan.performance,
            },
          },
        });
      } catch {
        webviewContext.panel.dispose();
        vscode.window.showWarningMessage(
          `Unable to render "${getPathBaseName(webviewContext.document.fileName)}" as a diff.`,
        );
        void vscode.commands.executeCommand("vscode.openWith", webviewContext.document.uri, "default");
      }
    }, 100);
  }

  private prepareWebviewForRender(webviewContext: WebviewContext): void {
    this.postMessageToWebviewWrapper({
      webview: webviewContext.panel.webview,
      message: {
        kind: "prepare",
      },
    });
  }

  private ensureWebviewShell(webviewContext: WebviewContext): void {
    if (webviewContext.shellInitialized) {
      return;
    }

    const webviewUri = webviewContext.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.extensionContext.extensionUri, this.args.webviewPath),
    );
    const cssUris = this.resolveCssUris({ webview: webviewContext.panel.webview });
    const nonce = this.generateNonce();

    webviewContext.panel.webview.html = buildSkeleton({
      webviewUri,
      commonCssUris: cssUris.commonCssUris,
      lightHighlightCssUri: cssUris.lightHighlightCssUri,
      darkHighlightCssUri: cssUris.darkHighlightCssUri,
      cspSource: webviewContext.panel.webview.cspSource,
      nonce,
    });
    webviewContext.shellInitialized = true;
  }

  private createRenderPlan(args: {
    requestedConfig: AppConfig;
    text: string;
    diffFiles: ReturnType<typeof parse>;
    collapseAll: boolean;
  }): WebviewRenderPlan {
    const isLargeDiff =
      args.text.length >= LARGE_DIFF_TEXT_THRESHOLD || args.diffFiles.length >= LARGE_DIFF_FILE_THRESHOLD;
    const forcedLineByLine = isLargeDiff && args.requestedConfig.diff2html.outputFormat === "side-by-side";
    const warningParts: string[] = [];

    if (isLargeDiff) {
      warningParts.push("Large diff detected. Files are opened collapsed to reduce initial render cost.");
    }
    if (forcedLineByLine) {
      warningParts.push("Side-by-side view was replaced with line-by-line for this render.");
    }

    return {
      collapseAll: args.collapseAll || isLargeDiff,
      performance: {
        isLargeDiff,
        warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
        deferViewedStateHashing: isLargeDiff,
      },
      config: forcedLineByLine
        ? {
            diff2html: {
              ...args.requestedConfig.diff2html,
              outputFormat: "line-by-line",
            },
          }
        : args.requestedConfig,
    };
  }

  private async collectAccessiblePaths(args: {
    webviewContext: WebviewContext;
    diffFiles: ReturnType<typeof parse>;
  }): Promise<string[]> {
    const candidatePaths = new Set<string>();

    for (const diffFile of args.diffFiles) {
      const oldPath = this.normalizeDiffFilePath(diffFile.oldName);
      const newPath = this.normalizeDiffFilePath(diffFile.newName);
      if (oldPath) {
        candidatePaths.add(oldPath);
      }
      if (newPath) {
        candidatePaths.add(newPath);
      }
    }

    const cacheKey = Array.from(candidatePaths).sort().join("\n");
    if (args.webviewContext.accessiblePathsCacheKey === cacheKey && args.webviewContext.accessiblePathsCache) {
      return args.webviewContext.accessiblePathsCache;
    }

    const accessiblePaths = await Promise.all(
      Array.from(candidatePaths).map(async (path) => {
        const uri = await resolveAccessibleUri({
          diffDocument: args.webviewContext.document,
          path,
        });
        return uri ? path : undefined;
      }),
    );

    const resolvedPaths = accessiblePaths.filter((path): path is string => Boolean(path));
    args.webviewContext.accessiblePathsCacheKey = cacheKey;
    args.webviewContext.accessiblePathsCache = resolvedPaths;
    return resolvedPaths;
  }

  private clearAccessiblePathsCache(webviewContext: WebviewContext): void {
    webviewContext.accessiblePathsCacheKey = undefined;
    webviewContext.accessiblePathsCache = undefined;
  }

  private normalizeDiffFilePath(path?: string): string | undefined {
    if (!path || path === "/dev/null") {
      return;
    }

    const normalizedPath = extractNewFileNameFromDiffName(path);
    return normalizedPath === "/dev/null" ? undefined : normalizedPath;
  }

  private resolveCssUris(args: { webview: vscode.Webview }): ResolvedCssUris {
    // IMPORTANT: Order matters!
    const commonCssUris = [
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(this.args.extensionContext.extensionUri, STYLES_FOLDER_NAME, RESET_CSS_FILE_NAME),
      ),
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(this.args.extensionContext.extensionUri, STYLES_FOLDER_NAME, APP_CSS_FILE_NAME),
      ),
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(this.args.extensionContext.extensionUri, STYLES_FOLDER_NAME, DIFF2HTML_DEP_CSS_FILE_NAME),
      ),
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.args.extensionContext.extensionUri,
          STYLES_FOLDER_NAME,
          DIFF2HTML_TWEAKS_CSS_FILE_NAME,
        ),
      ),
    ];

    return {
      commonCssUris,
      lightHighlightCssUri: args.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.args.extensionContext.extensionUri,
          STYLES_FOLDER_NAME,
          HIGHLIGHT_JS_DEP_CSS_FILE_NAME("light"),
        ),
      ),
      darkHighlightCssUri: args.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.args.extensionContext.extensionUri,
          STYLES_FOLDER_NAME,
          HIGHLIGHT_JS_DEP_CSS_FILE_NAME("dark"),
        ),
      ),
    };
  }

  private postMessageToWebviewWrapper(args: { webview: vscode.Webview; message: MessageToWebview }): void {
    args.webview.postMessage(args.message);
  }

  private generateNonce(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
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
