import * as vscode from "vscode";
import { DiffViewerProvider } from "./DiffViewerProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(DiffViewerProvider.register(context));
}

export function deactivate(): void {
  // Nothing to do here
}
