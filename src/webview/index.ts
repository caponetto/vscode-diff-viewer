import { MessageToExtension, MessageToWebview } from "../shared/message";
import { MessageToWebviewHandlerImpl } from "./message/handler";

const webviewApi = acquireVsCodeApi();
function postMessageToExtensionWrapper(message: MessageToExtension): void {
  webviewApi.postMessage(message);
}

const messageReceivedHandler = new MessageToWebviewHandlerImpl(postMessageToExtensionWrapper);
window.addEventListener("message", (event: MessageEvent<MessageToWebview>) => {
  if (event.origin !== window.origin) {
    return;
  }

  messageReceivedHandler.onMessageReceived(event.data);
});
