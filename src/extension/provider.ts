import { parse } from "diff2html";
import { basename } from "path";
import * as vscode from "vscode";
import { MessageToExtensionHandler, MessageToWebview } from "../shared/message";
import { APP_CONFIG_SECTION, extractConfig } from "./configuration";
import { MessageToExtensionHandlerImpl } from "./message/handler";
import { buildSkeleton, SkeletonElementIds } from "./skeleton";

interface DiffViewerProviderArgs {
  extensionContext: vscode.ExtensionContext;
  webviewPath: string;
}

interface WebviewContext {
  document: vscode.TextDocument;
  panel: vscode.WebviewPanel;
}

export class DiffViewerProvider implements vscode.CustomTextEditorProvider {
  private static readonly VIEW_TYPE = "diffViewer";
  private messageReceivedHandler: MessageToExtensionHandler | undefined;

  public constructor(private readonly args: DiffViewerProviderArgs) {}

  public static register(args: DiffViewerProviderArgs): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(DiffViewerProvider.VIEW_TYPE, new DiffViewerProvider(args), {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  public async resolveCustomTextEditor(
    diffDocument: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (token.isCancellationRequested) {
      return;
    }

    const webviewUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.args.extensionContext.extensionUri, this.args.webviewPath)
    );

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = buildSkeleton(webviewUri);

    this.messageReceivedHandler = new MessageToExtensionHandlerImpl({
      diffDocument,
      postMessageToWebviewFn: (message: MessageToWebview) => {
        this.postMessageToWebviewWrapper({ webview: webviewPanel.webview, message });
      },
    });

    const webviewContext: WebviewContext = { document: diffDocument, panel: webviewPanel };

    this.postMessageToWebviewWrapper({
      webview: webviewPanel.webview,
      message: {
        kind: "ping",
      },
    });

    this.registerEventHandlers(webviewContext);
    this.updateWebview(webviewContext);
  }

  private registerEventHandlers(webviewContext: WebviewContext) {
    const disposables = vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.fsPath !== webviewContext.document.uri.fsPath) {
          return;
        }

        this.updateWebview(webviewContext);
      }),
      webviewContext.panel.webview.onDidReceiveMessage((m) => {
        this.messageReceivedHandler?.onMessageReceived(m);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(APP_CONFIG_SECTION)) {
          return;
        }

        this.updateWebview(webviewContext);
      })
    );

    webviewContext.panel.onDidDispose(() => disposables.dispose());
  }

  private updateWebview(webviewContext: WebviewContext): void {
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

    this.postMessageToWebviewWrapper({
      webview: webviewContext.panel.webview,
      message: {
        kind: "updateWebview",
        payload: {
          config: config,
          diffFiles: diffFiles,
          diffContainer: SkeletonElementIds.DiffContainer,
        },
      },
    });
  }

  private postMessageToWebviewWrapper(args: { webview: vscode.Webview; message: MessageToWebview }): void {
    args.webview.postMessage(args.message);
  }
}
