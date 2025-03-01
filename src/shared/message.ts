import { MessageToExtensionApi } from "../extension/message/api";
import { MessageToWebviewApi } from "../webview/message/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FunctionArgsType<T> = T extends () => any ? never : T extends (args: infer A) => any ? A : never;

type DistributeMessageApiType<T> = {
  [K in keyof T]: FunctionArgsType<T[K]> extends never ? { kind: K } : { kind: K; payload: FunctionArgsType<T[K]> };
}[keyof T];

interface MessageHandler<M extends MessageToWebview | MessageToExtension> {
  onMessageReceived(message: M): void;
}

export interface MessageToExtensionHandler extends MessageHandler<MessageToExtension>, MessageToExtensionApi {}
export interface MessageToWebviewHandler extends MessageHandler<MessageToWebview>, MessageToWebviewApi {}

export type MessageToWebview = DistributeMessageApiType<MessageToWebviewApi>;
export type MessageToExtension = DistributeMessageApiType<MessageToExtensionApi>;
