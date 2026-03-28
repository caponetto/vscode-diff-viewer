import { DiffFile } from "diff2html/lib/types";
import { AppConfig } from "../../extension/configuration";
import { ViewedState } from "../../extension/viewed-state";

export type ReviewAction = "expandAll" | "collapseAll";
export type ExtensionAction = "showRaw";
export type WebviewAction = ReviewAction | ExtensionAction;

export interface WebviewUiState {
  scrollTop: number;
  selectedPath?: string;
}

export interface WebviewPerformanceHints {
  isLargeDiff: boolean;
  warning?: string;
  deferViewedStateHashing: boolean;
}

export interface UpdateWebviewPayload {
  config: AppConfig;
  diffFiles: DiffFile[];
  accessiblePaths: string[];
  viewedState: ViewedState;
  collapseAll: boolean;
  performance: WebviewPerformanceHints;
}

export interface MessageToWebviewApi {
  prepare: () => void;
  updateWebview: (payload: UpdateWebviewPayload) => Promise<void>;
  performWebviewAction: (payload: { action: WebviewAction }) => void;
}

export const MESSAGE_TO_WEBVIEW_KINDS = [
  "prepare",
  "updateWebview",
  "performWebviewAction",
] as const satisfies readonly (keyof MessageToWebviewApi)[];
