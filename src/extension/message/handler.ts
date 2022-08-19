import { basename, join } from "path";
import * as vscode from "vscode";
import { MessageToExtension, MessageToExtensionHandler, MessageToWebview } from "../../shared/message";
import { ViewedStateStore } from "../viewed-state";

export class MessageToExtensionHandlerImpl implements MessageToExtensionHandler {
  constructor(
    private readonly args: {
      diffDocument: vscode.TextDocument;
      viewedStateStore: ViewedStateStore;
      postMessageToWebviewFn: (message: MessageToWebview) => void;
    }
  ) {}

  public onMessageReceived(message: MessageToExtension): void {
    if ("payload" in message) {
      this[message.kind](message.payload as any);
    } else {
      this[message.kind]();
    }
  }

  public async pong(): Promise<void> {
    console.info("Extension pong!");
  }

  public async openFile(payload: { path: string; line?: number }): Promise<void> {
    const uri =
      (await this.getUriFromPathIfExists(payload.path)) || (await this.getUriFromPathInWorkspaceIfExists(payload.path));

    if (!uri) {
      vscode.window.showWarningMessage(
        `Cannot locate the file "${basename(payload.path)}" neither in the workspace nor by the specified path.`
      );
      return;
    }

    const showOptions: vscode.TextDocumentShowOptions = {};
    if (payload.line) {
      showOptions.selection = new vscode.Range(payload.line - 1, 0, payload.line - 1, 0);
    }

    vscode.commands.executeCommand("vscode.open", uri, showOptions);
  }

  public toggleFileViewed(payload: { path: string; value: boolean }): void {
    this.args.viewedStateStore.toggleViewedState(payload);
  }

  private async getUriFromPathInWorkspaceIfExists(path: string): Promise<vscode.Uri | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.args.diffDocument.uri);
    if (!workspaceFolder) {
      return;
    }

    const fullPath = join(workspaceFolder.uri.fsPath, path);
    return this.getUriFromPathIfExists(fullPath);
  }

  private async getUriFromPathIfExists(path: string): Promise<vscode.Uri | undefined> {
    const uri = vscode.Uri.file(path);
    if (!(await this.exists(uri))) {
      return;
    }

    return uri;
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (e) {
      return false;
    }
  }
}
