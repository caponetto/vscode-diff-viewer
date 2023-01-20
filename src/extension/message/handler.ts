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

  public pong(): void {
    // console.debug("Extension pong!");
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

  public toggleFileViewed(payload: { path: string; viewedSha1: string | null }): void {
    this.args.viewedStateStore.toggleViewedState(payload);
  }

  private async getUriFromPathInWorkspaceIfExists(path: string): Promise<vscode.Uri | undefined> {
    const workspaceFolder = this.findDiffFileWorkspace();
    if (!workspaceFolder) {
      return;
    }

    const fullPath = join(workspaceFolder.uri.fsPath, path);
    return this.getUriFromPathIfExists(fullPath);
  }

  private findDiffFileWorkspace(): vscode.WorkspaceFolder | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(this.args.diffDocument.uri);
    if (folder) return folder;

    // in case the diff file comes from a custom virtual file system
    // try to find if it matches any of the available workspaces using their URI schemes
    const workspaceSchemes = new Set(vscode.workspace.workspaceFolders?.map((folder) => folder.uri.scheme));
    for (const scheme of workspaceSchemes) {
      const workspaceSchemeDiffDocumentUri = this.args.diffDocument.uri.with({ scheme });
      const folder = vscode.workspace.getWorkspaceFolder(workspaceSchemeDiffDocumentUri);
      if (folder) return folder;
    }
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
