import { Diff2HtmlConfig, parse } from "diff2html";
import { LineMatchingType, OutputFormatType } from "diff2html/lib/types";
import * as vscode from "vscode";

export class DiffViewerProvider implements vscode.CustomTextEditorProvider {
  private static readonly VIEW_TYPE = "diffViewer";
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(DiffViewerProvider.VIEW_TYPE, new DiffViewerProvider(context), {
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

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const config = this.extractConfig();

    // we want to be able to ignore the update that VSCode sends us after we've edited the "viewed" line
    let oldContent: string;

    const updateWebview = () => {
      const content = diffDocument.getText();
      if (content === oldContent) return;

      oldContent = content;

      const diffFiles = parse(content, config);
      const viewedFiles = getViewedFiles(content);

      if (diffFiles.length === 0) {
        webviewPanel.dispose();
        vscode.window.showInformationMessage(`No diff structure found in ${diffDocument.fileName}.`);
        vscode.commands.executeCommand("vscode.openWith", diffDocument.uri, "default");
        return;
      }

      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

      webviewPanel.webview.postMessage({
        config: config,
        diffFiles: diffFiles,
        viewedFiles: viewedFiles,
        destination: "app",
      });
    }

    const messageReceiverSubscription = webviewPanel.webview.onDidReceiveMessage((message: FileViewedMessage) => {
      const eol = diffDocument.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
      const edited = updateViewedFiles(diffDocument.getText(), message, eol);

      oldContent = edited;

      // just replace the entire document every time; a more complete extension should compute minimal edits instead.
   		const edit = new vscode.WorkspaceEdit();
      edit.replace(
        diffDocument.uri,
        new vscode.Range(0, 0, diffDocument.lineCount, 0),
        edited);

      return vscode.workspace.applyEdit(edit);
    })

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === diffDocument.uri.toString()) {
				updateWebview();
			}
		});

		// Make sure we get rid of the listener when our editor is closed.
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
      messageReceiverSubscription.dispose();
		});

    updateWebview();
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const appJsUri = webview.asWebviewUri(this.resolveStaticFile("app.js"));
    const appCssUri = webview.asWebviewUri(this.resolveStaticFile("app.css"));
    const resetCssUri = webview.asWebviewUri(this.resolveStaticFile("reset.css"));

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title></title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <link href="${resetCssUri}" rel="stylesheet" />
				<link href="${appCssUri}" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/github.min.css" />
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />
        <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>
      </head>
      <body>
        <div id="app"></div>
        <footer id="count"></footer>
        <script src="${appJsUri}"></script>
      </body>
      </html>`;
  }

  private resolveStaticFile(filename: string): vscode.Uri {
    return vscode.Uri.joinPath(this.context.extensionUri, "static", filename);
  }

  private extractConfig(): Diff2HtmlConfig {
    return {
      outputFormat: vscode.workspace
        .getConfiguration("diffviewer")
        .get<string>("outputFormat", "side-by-side") as OutputFormatType,
      drawFileList: vscode.workspace.getConfiguration("diffviewer").get<boolean>("drawFileList", true),
      matching: vscode.workspace.getConfiguration("diffviewer").get<string>("matching", "none") as LineMatchingType,
      matchWordsThreshold: vscode.workspace.getConfiguration("diffviewer").get<number>("matchWordsThreshold", 0.25),
      matchingMaxComparisons: vscode.workspace
        .getConfiguration("diffviewer")
        .get<number>("matchingMaxComparisons", 2500),
      maxLineSizeInBlockForComparison: vscode.workspace
        .getConfiguration("diffviewer")
        .get<number>("maxLineSizeInBlockForComparison", 200),
      maxLineLengthHighlight: vscode.workspace
        .getConfiguration("diffviewer")
        .get<number>("maxLineLengthHighlight", 10000),
      renderNothingWhenEmpty: vscode.workspace
        .getConfiguration("diffviewer")
        .get<boolean>("renderNothingWhenEmpty", false),
    };
  }
}

interface FileViewedMessage {
  command: 'reportFileViewed',
  index: number,
  viewed: boolean,
}

const VIEWED_RE = /(^|\n)viewed\s+([0-9a-f]+)(\s.*)\s*($|\n)/i;
const VIEWED_HEX_POS = 2; // capturing group index

function  getViewedFiles(content: string): boolean[] {
  const viewedMatch = VIEWED_RE.exec(content);
  const viewed = viewedMatch?.[VIEWED_HEX_POS]?.trim();
  if (viewed) {
    return parseHexBitmap(viewed);
  }
  return [];
}

function updateViewedFiles(content: string, update: FileViewedMessage, eol: string): string {
  const viewedMatch = VIEWED_RE.exec(content);
  const viewed = viewedMatch?.[VIEWED_HEX_POS]?.trim();
  const bitmap = viewed ? parseHexBitmap(viewed) : [];
  bitmap[update.index] = update.viewed;

  const lineStart = viewedMatch?.[1] ?? '';

  const newViewedLine = `${lineStart}viewed ${bitmapToHex(bitmap)} (hex bitmap)${eol}`;

  if (viewed) {
    return content.replace(VIEWED_RE, newViewedLine);
  } else {
    return newViewedLine + content;
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

const TO_HEX = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

function parseHexBitmap(s: string): boolean[] {
  const retval = [];
  for (const char of s) {
    retval.push(...HEX[char]);
  }
  return retval;
}

function bitmapToHex(bitmap: boolean[]): string {
  const retval = [];

  // go 4 bits (a nibble) at a time
  for (let i = 0; i < bitmap.length; i += 4) {
    const number = (bitmap[i] ? 8 : 0) +
      (bitmap[i+1] ? 4 : 0) +
      (bitmap[i+2] ? 2 : 0) +
      (bitmap[i+3] ? 1 : 0);
    retval.push(TO_HEX[number]);
  }

  return retval.join('');
}
