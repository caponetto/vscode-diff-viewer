import { MessageToExtensionApi } from "../extension/message/api";
import { MessageToWebviewApi } from "../webview/message/api";

/**
 * Extracts the argument type from a function type.
 * Returns `never` for functions with no arguments, otherwise returns the argument type.
 */
type FunctionArgsType<T> = T extends () => unknown ? never : T extends (args: infer A) => unknown ? A : never;

/**
 * Distributes a message API type into a union of message objects.
 * Each message has a `kind` property and optionally a `payload` property.
 *
 * @template T - The message API type (must be a record of functions)
 * @example
 * ```typescript
 * interface Api {
 *   method1: () => void;
 *   method2: (payload: { id: string }) => void;
 * }
 *
 * // Results in:
 * // { kind: "method1" } | { kind: "method2"; payload: { id: string } }
 * type Messages = DistributeMessageApiType<Api>;
 * ```
 */
type DistributeMessageApiType<T> = {
  [K in keyof T]: FunctionArgsType<T[K]> extends never ? { kind: K } : { kind: K; payload: FunctionArgsType<T[K]> };
}[keyof T];

/**
 * Generic message handler interface for type-safe message handling.
 *
 * @template T - The message API type that this handler can process
 */
export interface GenericMessageHandler<T> {
  /**
   * Handles incoming messages of the specified type.
   *
   * @param message - The message to handle, typed according to the API
   */
  onMessageReceived(message: DistributeMessageApiType<T>): void;
}

/**
 * Message handler for extension-side message processing.
 * Extends both the generic handler and the extension API for type safety.
 */
export interface MessageToExtensionHandler
  extends GenericMessageHandler<MessageToExtensionApi>,
    MessageToExtensionApi {}

/**
 * Message handler for webview-side message processing.
 * Extends both the generic handler and the webview API for type safety.
 */
export interface MessageToWebviewHandler extends GenericMessageHandler<MessageToWebviewApi>, MessageToWebviewApi {}

/**
 * Union type of all possible messages that can be sent to the webview.
 * Each message has a `kind` property and optionally a `payload` property.
 */
export type MessageToWebview = DistributeMessageApiType<MessageToWebviewApi>;

/**
 * Union type of all possible messages that can be sent to the extension.
 * Each message has a `kind` property and optionally a `payload` property.
 */
export type MessageToExtension = DistributeMessageApiType<MessageToExtensionApi>;

/**
 * Utility type to extract the kind of a message.
 *
 * @template T - The message type
 * @example
 * ```typescript
 * type MessageKind = MessageKind<MessageToWebview>; // "ping" | "prepare" | "updateWebview"
 * ```
 */
export type MessageKind<T> = T extends { kind: infer K } ? K : never;

/**
 * Utility type to extract the payload type for a specific message kind.
 *
 * @template T - The message type
 * @template K - The message kind
 * @example
 * ```typescript
 * type UpdateWebviewPayload = MessagePayload<MessageToWebview, "updateWebview">;
 * ```
 */
export type MessagePayload<T, K extends MessageKind<T>> = T extends { kind: K; payload: infer P } ? P : never;

/**
 * Type guard to check if a message has a payload.
 *
 * @param message - The message to check
 * @returns True if the message has a payload, false otherwise
 */
export function hasPayload<T extends { kind: string; payload?: unknown }>(
  message: T,
): message is T & { payload: NonNullable<T["payload"]> } {
  return message.payload !== undefined;
}

/**
 * Type guard to check if a message is of a specific kind.
 *
 * @param message - The message to check
 * @param kind - The kind to check against
 * @returns True if the message is of the specified kind, false otherwise
 */
export function isMessageKind<T extends { kind: string }>(
  message: T,
  kind: MessageKind<T>,
): message is Extract<T, { kind: typeof kind }> {
  return message.kind === kind;
}
