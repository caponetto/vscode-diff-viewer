import * as chardet from "chardet";
import * as path from "path";
import * as vscode from "vscode";

const VIEWED_RE = /(?:^|\n)viewed\s+([0-9a-f]+)(?:\s.*)\s*(?:$|\n)/i;

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
    const encoding = chardet.detect(fileData);
    const decoder = new TextDecoder(encoding ?? "utf-8");
    return new DiffDocument(uri, decoder.decode(fileData));
  }

  public getViewedFiles(): boolean[] {
    const viewedMatch = VIEWED_RE.exec(this.content);
    const viewed = viewedMatch?.[1]?.trim();
    if (viewed) {
      return parseHexBitmap(viewed);
    }
    return [];
  }
}

const HEX: {[s: string]: [boolean, boolean, boolean, boolean]} = {
  '0': [false, false, false, false],
  '1': [false, false, false, true],
  '2': [false, false, true, false],
  '3': [false, false, true, true],
  '4': [false, true, false, false],
  '5': [false, true, false, true],
  '6': [false, true, true, false],
  '7': [false, true, true, true],
  '8': [true, false, false, false],
  '9': [true, false, false, true],
  'a': [true, false, true, false],
  'b': [true, false, true, true],
  'c': [true, true, false, false],
  'd': [true, true, false, true],
  'e': [true, true, true, false],
  'f': [true, true, true, true],
}

function parseHexBitmap(s: string): boolean[] {
  const retval = [];
  for (const char of s) {
    retval.push(...HEX[char]);
  }
  return retval;
}
