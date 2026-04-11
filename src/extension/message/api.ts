import { WebviewAction } from "../../webview/message/api";
import { MESSAGE_TO_EXTENSION_REPORT_KINDS, MessageToExtensionReportApi } from "./testing/api";

export interface MessageToExtensionCommandApi {
  ready: (payload: { shellGeneration: number }) => void;
  openFile: (payload: { path: string; line?: number }) => Promise<void>;
  toggleFileViewed: (payload: { path: string; viewedSha1: string | null }) => void;
  requestWebviewAction: (payload: { action: WebviewAction }) => void;
}

export interface MessageToExtensionApi extends MessageToExtensionCommandApi, MessageToExtensionReportApi {}

export const MESSAGE_TO_EXTENSION_COMMAND_KINDS = [
  "ready",
  "openFile",
  "toggleFileViewed",
  "requestWebviewAction",
] as const satisfies readonly (keyof MessageToExtensionCommandApi)[];

export const MESSAGE_TO_EXTENSION_KINDS = [
  ...MESSAGE_TO_EXTENSION_COMMAND_KINDS,
  ...MESSAGE_TO_EXTENSION_REPORT_KINDS,
] as const satisfies readonly (keyof MessageToExtensionApi)[];
