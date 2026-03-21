import * as vscode from "vscode";
import { MessageToExtensionHandler, MessageToWebview } from "../../shared/message";
import { GenericMessageHandlerImpl } from "../../shared/message-handler";
import { getPathBaseName } from "../../shared/path";
import { ViewedStateStore } from "../viewed-state";
import { WebviewAction } from "../../webview/message/api";
import { resolveAccessibleUri } from "../path-resolution";

export class MessageToExtensionHandlerImpl extends GenericMessageHandlerImpl implements MessageToExtensionHandler {
  constructor(
    private readonly args: {
      diffDocument: vscode.TextDocument;
      viewedStateStore: ViewedStateStore;
      postMessageToWebviewFn: (message: MessageToWebview) => void;
      onWebviewActionRequested: (action: WebviewAction) => void;
    },
  ) {
    super();
  }

  public pong(): void {
    // console.debug("Extension pong!");
  }

  public async openFile(payload: { path: string; line?: number }): Promise<void> {
    const uri = await resolveAccessibleUri({
      diffDocument: this.args.diffDocument,
      path: payload.path,
    });
    if (!uri) {
      vscode.window.showWarningMessage(
        `Cannot locate the file "${getPathBaseName(payload.path)}" neither in the workspace nor by the specified path.`,
      );
      return;
    }

    const showOptions: vscode.TextDocumentShowOptions = {};
    if (payload.line && payload.line > 0) {
      showOptions.selection = new vscode.Range(payload.line - 1, 0, payload.line - 1, 0);
    }

    await vscode.commands.executeCommand("vscode.open", uri, showOptions);
  }

  public toggleFileViewed(payload: { path: string; viewedSha1: string | null }): void {
    this.args.viewedStateStore.toggleViewedState(payload);
  }

  public requestWebviewAction(payload: { action: WebviewAction }): void {
    this.args.onWebviewActionRequested(payload.action);
  }
}
