import * as path from "path";
import * as vscode from "vscode";

export class DiffDocument implements vscode.CustomDocument {
  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;

  get filename(): string {
    return path.basename(this.uri.fsPath);
  }

  private constructor(public readonly uri: vscode.Uri, public readonly content: string) {}

  public dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }

  public static async create(uri: vscode.Uri): Promise<DiffDocument | PromiseLike<DiffDocument>> {
    const fileData = await vscode.workspace.fs.readFile(uri);
    return new DiffDocument(uri, fileData.toString());
  }
}
