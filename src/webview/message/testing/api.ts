import { AppConfig } from "../../../extension/configuration";

export interface WebviewTestState {
  isReady: boolean;
  shellGeneration: number;
  outputFormat?: AppConfig["diff2html"]["outputFormat"];
  colorScheme?: AppConfig["diff2html"]["colorScheme"];
  fileCount: number;
  filePaths: string[];
  fileHeaders: string[];
  fileListVisible: boolean;
  collapsedFilePaths: string[];
  selectedPath?: string;
  largeDiffWarning?: string;
  scrollbarVisible: boolean;
  inlineHighlightCount: number;
  lightHighlightDisabled: boolean;
  darkHighlightDisabled: boolean;
  codeLineTexts: string[];
}

export type WebviewTestAction =
  | { kind: "clickFileName"; path: string }
  | { kind: "clickLineNumber"; path: string; line: number }
  | { kind: "toggleViewed"; path: string; viewed: boolean };

export interface MessageToWebviewTestApi {
  captureTestState: (payload: { requestId: string }) => void;
  runTestAction: (payload: { requestId: string; action: WebviewTestAction }) => Promise<void>;
}

export const MESSAGE_TO_WEBVIEW_TEST_KINDS = [
  "captureTestState",
  "runTestAction",
] as const satisfies readonly (keyof MessageToWebviewTestApi)[];
