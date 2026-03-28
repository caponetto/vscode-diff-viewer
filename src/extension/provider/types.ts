import { parse } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import * as vscode from "vscode";
import { AppConfig } from "../configuration";
import { ViewedStateStore } from "../viewed-state";

export interface DiffViewerProviderArgs {
  extensionContext: vscode.ExtensionContext;
  webviewPath: string;
}

export interface WebviewContext {
  document: vscode.TextDocument;
  viewedStateStore: ViewedStateStore;
  panel: vscode.WebviewPanel;
  isDisposed: boolean;
  renderRequestId: number;
  shellInitialized: boolean;
  shellGeneration: number;
  webviewReady: boolean;
  pendingReadyRender?: {
    collapseAll: boolean;
  };
  lastRenderedColorScheme?: ColorSchemeType;
  pendingRender?: ReturnType<typeof setTimeout>;
  accessiblePathsCacheKey?: string;
  accessiblePathsCache?: string[];
}

export interface WebviewRenderPlan {
  collapseAll: boolean;
  performance: {
    isLargeDiff: boolean;
    warning?: string;
    deferViewedStateHashing: boolean;
  };
  config: AppConfig;
}

export interface RenderedWebviewData {
  diffFiles: ReturnType<typeof parse>;
  viewedState: ReturnType<ViewedStateStore["getViewedState"]>;
  accessiblePaths: string[];
  renderPlan: WebviewRenderPlan;
}

export interface ResolvedCssUris {
  commonCssUris: vscode.Uri[];
  lightHighlightCssUri: vscode.Uri;
  darkHighlightCssUri: vscode.Uri;
}
