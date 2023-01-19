import { parse } from "diff2html";
import { basename } from "path";
import * as vscode from "vscode";
import { SkeletonElementIds } from "../shared/css/elements";
import { MessageToExtensionHandler, MessageToWebview } from "../shared/message";
import { APP_CONFIG_SECTION, extractConfig, setOutputFormatConfig } from "./configuration";
import { MessageToExtensionHandlerImpl } from "./message/handler";
import { buildSkeleton } from "./skeleton";
import { ViewedStateStore } from "./viewed-state";

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
    ];
  }

  public async resolveCustomTextEditor(
    diffDocument: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
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

    const webviewUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.extensionContext.extensionUri, this.args.webviewPath)
    );

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = buildSkeleton(webviewUri);

    const viewedStateStore = new ViewedStateStore({
      context: this.args.extensionContext,
      docId: diffDocument.uri.fsPath,
    });

    const messageReceivedHandler = new MessageToExtensionHandlerImpl({
      diffDocument,
      viewedStateStore,
      postMessageToWebviewFn: (message: MessageToWebview) => {
        this.postMessageToWebviewWrapper({ webview: webviewPanel.webview, message });
      },
    });

    const webviewContext: WebviewContext = { document: diffDocument, panel: webviewPanel, viewedStateStore };

    this.registerEventHandlers({ webviewContext, messageHandler: messageReceivedHandler });
    this.updateWebview(webviewContext);
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
      })
    );

    args.webviewContext.panel.onDidDispose(() => disposables.dispose());
  }

  private updateWebview(webviewContext: WebviewContext): void {
    this.postMessageToWebviewWrapper({
      webview: webviewContext.panel.webview,
      message: {
        kind: "prepare",
      },
    });

    setTimeout(() => {
      const config = extractConfig();
      const diffFiles = parse(webviewContext.document.getText(), config.diff2html);

      if (diffFiles.length === 0) {
        webviewContext.panel.dispose();
        vscode.window.showWarningMessage(
          `No diff structure found in the file "${basename(webviewContext.document.fileName)}".`
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
            diffContainer: SkeletonElementIds.DiffContainer,
          },
        },
      });
    }, 100);
  }

  private postMessageToWebviewWrapper(args: { webview: vscode.Webview; message: MessageToWebview }): void {
    args.webview.postMessage(args.message);
  }
}
