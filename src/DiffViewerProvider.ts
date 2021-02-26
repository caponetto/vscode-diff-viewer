import { Diff2HtmlConfig, parse } from "diff2html";
import { LineMatchingType, OutputFormatType } from "diff2html/lib/types";
import * as path from "path";
import * as vscode from "vscode";
import { DiffDocument } from "./DiffDocument";

export class DiffViewerProvider implements vscode.CustomReadonlyEditorProvider<DiffDocument> {
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

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<DiffDocument> {
    return await DiffDocument.create(uri);
  }

  public async resolveCustomEditor(
    document: DiffDocument,
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
    const diffFiles = parse(document.content, config);

    if (diffFiles.length === 0) {
      vscode.window.showInformationMessage(`No diff structure found in ${document.filename}.`);
      vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
      return;
    }

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.postMessage({
      type: "init",
      config: config,
      diffFiles: diffFiles,
      destination: "app",
    });
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
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.13.1/styles/github.min.css" />
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />
        <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>
      </head>
      <body>
        <div id="app"></div>
        <script src="${appJsUri}"></script>
      </body>
      </html>`;
  }

  private resolveStaticFile(filename: string): vscode.Uri {
    return vscode.Uri.file(path.join(this.context.extensionPath, "static", filename));
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
