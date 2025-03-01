import * as vscode from "vscode";
import { DiffViewerProvider } from "./provider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    ...DiffViewerProvider.registerContributions({ extensionContext: context, webviewPath: "dist/webview.js" }),
  );
}

export function deactivate(): void {
  // Nothing to do here
}
