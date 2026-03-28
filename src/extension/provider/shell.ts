import * as vscode from "vscode";
import {
  APP_CSS_FILE_NAME,
  DIFF2HTML_DEP_CSS_FILE_NAME,
  DIFF2HTML_TWEAKS_CSS_FILE_NAME,
  HIGHLIGHT_JS_DEP_CSS_FILE_NAME,
  RESET_CSS_FILE_NAME,
  STYLES_FOLDER_NAME,
} from "../../shared/css/files";
import { buildSkeleton } from "../skeleton";
import { DiffViewerProviderArgs, ResolvedCssUris, WebviewContext } from "./types";

export function ensureWebviewShell(args: {
  providerArgs: DiffViewerProviderArgs;
  webviewContext: WebviewContext;
}): void {
  if (args.webviewContext.shellInitialized) {
    return;
  }

  args.webviewContext.shellGeneration += 1;

  const webviewUri = args.webviewContext.panel.webview.asWebviewUri(
    vscode.Uri.joinPath(args.providerArgs.extensionContext.extensionUri, args.providerArgs.webviewPath),
  );
  const cssUris = resolveCssUris({ providerArgs: args.providerArgs, webview: args.webviewContext.panel.webview });
  const nonce = generateNonce();

  args.webviewContext.panel.webview.html = buildSkeleton({
    webviewUri,
    commonCssUris: cssUris.commonCssUris,
    lightHighlightCssUri: cssUris.lightHighlightCssUri,
    darkHighlightCssUri: cssUris.darkHighlightCssUri,
    cspSource: args.webviewContext.panel.webview.cspSource,
    nonce,
    shellGeneration: args.webviewContext.shellGeneration,
  });
  args.webviewContext.shellInitialized = true;
}

export function resolveCssUris(args: {
  providerArgs: DiffViewerProviderArgs;
  webview: vscode.Webview;
}): ResolvedCssUris {
  const commonCssUris = [
    args.webview.asWebviewUri(
      vscode.Uri.joinPath(args.providerArgs.extensionContext.extensionUri, STYLES_FOLDER_NAME, RESET_CSS_FILE_NAME),
    ),
    args.webview.asWebviewUri(
      vscode.Uri.joinPath(args.providerArgs.extensionContext.extensionUri, STYLES_FOLDER_NAME, APP_CSS_FILE_NAME),
    ),
    args.webview.asWebviewUri(
      vscode.Uri.joinPath(
        args.providerArgs.extensionContext.extensionUri,
        STYLES_FOLDER_NAME,
        DIFF2HTML_DEP_CSS_FILE_NAME,
      ),
    ),
    args.webview.asWebviewUri(
      vscode.Uri.joinPath(
        args.providerArgs.extensionContext.extensionUri,
        STYLES_FOLDER_NAME,
        DIFF2HTML_TWEAKS_CSS_FILE_NAME,
      ),
    ),
  ];

  return {
    commonCssUris,
    lightHighlightCssUri: args.webview.asWebviewUri(
      vscode.Uri.joinPath(
        args.providerArgs.extensionContext.extensionUri,
        STYLES_FOLDER_NAME,
        HIGHLIGHT_JS_DEP_CSS_FILE_NAME("light"),
      ),
    ),
    darkHighlightCssUri: args.webview.asWebviewUri(
      vscode.Uri.joinPath(
        args.providerArgs.extensionContext.extensionUri,
        STYLES_FOLDER_NAME,
        HIGHLIGHT_JS_DEP_CSS_FILE_NAME("dark"),
      ),
    ),
  };
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
