import { WebviewTestState } from "../../../webview/message/testing/api";

export interface MessageToExtensionReportApi {
  reportTestState: (payload: { requestId: string; state: WebviewTestState }) => void;
  reportTestActionResult: (payload: { requestId: string; error?: string }) => void;
}

export const MESSAGE_TO_EXTENSION_REPORT_KINDS = [
  "reportTestState",
  "reportTestActionResult",
] as const satisfies readonly (keyof MessageToExtensionReportApi)[];
