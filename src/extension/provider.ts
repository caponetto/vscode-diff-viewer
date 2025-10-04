import { parse } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import { basename } from "path";
import * as vscode from "vscode";
import { MessageToExtensionHandler, MessageToWebview } from "../shared/message";
import { APP_CONFIG_SECTION, AppConfig, extractConfig, setOutputFormatConfig } from "./configuration";
import { MessageToExtensionHandlerImpl } from "./message/handler";
import { buildSkeleton } from "./skeleton";
import { ViewedStateStore } from "./viewed-state";
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
}

export class DiffViewerProvider implements vscode.CustomTextEditorProvider {
  private static readonly VIEW_TYPE = "diffViewer";

  public constructor(private readonly args: DiffViewerProviderArgs) {}

  public static registerContributions(args: DiffViewerProviderArgs): vscode.Disposable[] {
    return [
      vscode.window.registerCustomEditorProvider(DiffViewerProvider.VIEW_TYPE, new DiffViewerProvider(args), {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }),
      vscode.commands.registerCommand("diffviewer.showLineByLine", () => setOutputFormatConfig("line-by-line")),
      vscode.commands.registerCommand("diffviewer.showSideBySide", () => setOutputFormatConfig("side-by-side")),
      vscode.commands.registerCommand("diffviewer.openCollapsed", async (file) => {
        const collapsedUri = file.with({ query: "collapsed" });
        await vscode.commands.executeCommand("vscode.openWith", collapsedUri, "diffViewer");
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

    const messageReceivedHandler = new MessageToExtensionHandlerImpl({
      diffDocument,
      viewedStateStore,
      postMessageToWebviewFn: (message: MessageToWebview) => {
        this.postMessageToWebviewWrapper({ webview: webviewPanel.webview, message });
      },
    });

    const webviewContext: WebviewContext = { document: diffDocument, panel: webviewPanel, viewedStateStore };

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
        args.messageHandler.onMessageReceived(m);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(APP_CONFIG_SECTION)) {
          return;
        }

        this.updateWebview(args.webviewContext);
      }),
      vscode.window.tabGroups.onDidChangeTabs(() => {
        this.updateWebview(args.webviewContext);
      }),
    );

    args.webviewContext.panel.onDidDispose(() => disposables.dispose());
  }

  private updateWebview(webviewContext: WebviewContext, collapseAll = false): void {
    this.postMessageToWebviewWrapper({
      webview: webviewContext.panel.webview,
      message: {
        kind: "prepare",
      },
    });

    const config = extractConfig();

    const webviewUri = webviewContext.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.extensionContext.extensionUri, this.args.webviewPath),
    );

    const cssUris = this.resolveCssUris({ webview: webviewContext.panel.webview, config });

    webviewContext.panel.webview.html = buildSkeleton({ webviewUri, cssUris });

    setTimeout(() => {
      const text = webviewContext.document.getText();
      const diffFiles = parse(text, config.diff2html);

      if (diffFiles.length === 0 && text.trim() !== "") {
        webviewContext.panel.dispose();
        vscode.window.showWarningMessage(
          `No diff structure found in the file "${basename(webviewContext.document.fileName)}".`,
        );
        vscode.commands.executeCommand("vscode.openWith", webviewContext.document.uri, "default");
        return;
      }

      const viewedState = webviewContext.viewedStateStore.getViewedState();

      this.postMessageToWebviewWrapper({
        webview: webviewContext.panel.webview,
        message: {
          kind: "updateWebview",
          payload: {
            config: config,
            diffFiles: diffFiles,
            viewedState: viewedState,
            collapseAll,
          },
        },
      });
    }, 100);
  }

  private resolveCssUris(args: { webview: vscode.Webview; config: AppConfig }): vscode.Uri[] {
    const appTheme = args.config.diff2html.colorScheme === ColorSchemeType.DARK ? "dark" : "light";
    // IMPORTANT: Order matters!
    return [
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(this.args.extensionContext.extensionUri, STYLES_FOLDER_NAME, RESET_CSS_FILE_NAME),
      ),
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(this.args.extensionContext.extensionUri, STYLES_FOLDER_NAME, APP_CSS_FILE_NAME),
      ),
      args.webview.asWebviewUri(
        vscode.Uri.joinPath(
          this.args.extensionContext.extensionUri,
          STYLES_FOLDER_NAME,
          HIGHLIGHT_JS_DEP_CSS_FILE_NAME(appTheme),
        ),
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
  }

  private postMessageToWebviewWrapper(args: { webview: vscode.Webview; message: MessageToWebview }): void {
    args.webview.postMessage(args.message);
  }
}
