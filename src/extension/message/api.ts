import { WebviewAction } from "../../webview/message/api";

export interface MessageToExtensionApi {
  pong: () => void;
  openFile: (payload: { path: string; line?: number }) => Promise<void>;
  toggleFileViewed: (payload: { path: string; viewedSha1: string | null }) => void;
  requestWebviewAction: (payload: { action: WebviewAction }) => void;
}

export const MESSAGE_TO_EXTENSION_KINDS = [
  "pong",
  "openFile",
  "toggleFileViewed",
  "requestWebviewAction",
] as const satisfies readonly (keyof MessageToExtensionApi)[];
