import { Diff2HtmlConfig, html, parse } from "diff2html";
import { LineMatchingType, OutputFormatType } from "diff2html/lib/types";
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

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, html(diffFiles, config));
  }

  private getHtmlForWebview(webview: vscode.Webview, diffContent: string): string {
    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title></title>
        <meta charset="UTF-8">
        <style>
          body {
            background-color: #fff !important;
            color: #000 !important;
          }
        </style>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />
      </head>
      <body>
        ${diffContent}
      </body>
      </html>`;
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
