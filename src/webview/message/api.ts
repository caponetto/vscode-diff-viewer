import { DiffFile } from "diff2html/lib/types";
import type { AppConfig } from "../../extension/configuration";
import { ViewedState } from "../../extension/viewed-state";
import { MESSAGE_TO_WEBVIEW_TEST_KINDS, MessageToWebviewTestApi } from "./testing/api";

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

export interface MessageToWebviewRenderApi {
  prepare: () => void;
  updateWebview: (payload: UpdateWebviewPayload) => Promise<void>;
  performWebviewAction: (payload: { action: WebviewAction }) => void;
}

export interface MessageToWebviewApi extends MessageToWebviewRenderApi, MessageToWebviewTestApi {}

export const MESSAGE_TO_WEBVIEW_RENDER_KINDS = [
  "prepare",
  "updateWebview",
  "performWebviewAction",
] as const satisfies readonly (keyof MessageToWebviewRenderApi)[];

export const MESSAGE_TO_WEBVIEW_KINDS = [
  ...MESSAGE_TO_WEBVIEW_RENDER_KINDS,
  ...MESSAGE_TO_WEBVIEW_TEST_KINDS,
] as const satisfies readonly (keyof MessageToWebviewApi)[];
