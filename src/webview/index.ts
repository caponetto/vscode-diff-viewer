import { isMessageToWebview, MessageToExtension, MessageToWebview } from "../shared/message";
import { MessageToWebviewHandlerImpl } from "./message/handler";
import { WebviewUiState } from "./message/api";

const webviewApi = acquireVsCodeApi<WebviewUiState>();
function postMessageToExtensionWrapper(message: MessageToExtension): void {
  webviewApi.postMessage(message);
}

const messageReceivedHandler = new MessageToWebviewHandlerImpl({
  postMessageToExtensionFn: postMessageToExtensionWrapper,
  state: {
    getState: () => webviewApi.getState() ?? undefined,
    setState: (state) => {
      webviewApi.setState(state);
    },
  },
});
globalThis.addEventListener("message", (event: MessageEvent<MessageToWebview>) => {
  if (event.origin !== globalThis.origin) {
    return;
  }

  if (!isMessageToWebview(event.data)) {
    return;
  }

  try {
    messageReceivedHandler.onMessageReceived(event.data);
  } catch {
    // ignore malformed or unknown messages posted to the webview
  }
});
