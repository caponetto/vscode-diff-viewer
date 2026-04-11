import { MessageToExtensionReportApi } from "./api";

export interface MessageToExtensionReportCallbacks {
  onTestStateReported?: MessageToExtensionReportApi["reportTestState"];
  onTestActionResultReported?: MessageToExtensionReportApi["reportTestActionResult"];
}

export class MessageToExtensionReportDispatcher implements MessageToExtensionReportApi {
  public constructor(private readonly callbacks: MessageToExtensionReportCallbacks) {}

  public reportTestState(payload: Parameters<MessageToExtensionReportApi["reportTestState"]>[0]): void {
    this.callbacks.onTestStateReported?.(payload);
  }

  public reportTestActionResult(payload: Parameters<MessageToExtensionReportApi["reportTestActionResult"]>[0]): void {
    this.callbacks.onTestActionResultReported?.(payload);
  }
}
