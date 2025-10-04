/**
 * Generic message handler implementation that provides a base class for handling
 * type-safe message routing in a VS Code extension.
 *
 * This abstract class automatically routes incoming messages to the appropriate
 * handler methods based on the message's `kind` property. It supports both
 * parameterless methods and methods that accept a payload.
 *
 * @example
 * ```typescript
 * class MyHandler extends GenericMessageHandlerImpl {
 *   // Handles messages with kind: "ping" (no payload)
 *   public ping(): void {
 *     console.log("Ping received!");
 *   }
 *
 *   // Handles messages with kind: "updateData" (with payload)
 *   public updateData(payload: { data: string }): void {
 *     console.log("Data updated:", payload.data);
 *   }
 * }
 *
 * const handler = new MyHandler();
 * handler.onMessageReceived({ kind: "ping" });
 * handler.onMessageReceived({ kind: "updateData", payload: { data: "test" } });
 * ```
 *
 * @see {@link GenericMessageHandler} - The interface this class implements
 * @see {@link MessageToExtensionHandler} - Extension-specific handler interface
 * @see {@link MessageToWebviewHandler} - Webview-specific handler interface
 */
export abstract class GenericMessageHandlerImpl {
  /**
   * Processes an incoming message by routing it to the appropriate handler method.
   *
   * This method uses reflection to find a method on the current instance that
   * matches the message's `kind` property. If the message has a payload, it
   * passes the payload as the first argument to the handler method. If no
   * payload is present, the handler method is called without arguments.
   *
   * @param message - The message to process
   * @param message.kind - The type of message, used to find the handler method
   * @param message.payload - Optional payload data to pass to the handler method
   *
   * @throws {Error} When no method matching the message kind is found on the handler
   *
   * @example
   * ```typescript
   * // For a message without payload
   * handler.onMessageReceived({ kind: "ping" });
   * // Calls: this.ping()
   *
   * // For a message with payload
   * handler.onMessageReceived({
   *   kind: "updateData",
   *   payload: { id: 123, name: "test" }
   * });
   * // Calls: this.updateData({ id: 123, name: "test" })
   * ```
   */
  public onMessageReceived(message: { kind: string; payload?: unknown }): void {
    const method = this[message.kind as keyof this] as (...args: unknown[]) => unknown;

    if (typeof method === "function") {
      if (message.payload !== undefined) {
        method.call(this, message.payload);
      } else {
        method.call(this);
      }
    } else {
      throw new Error(`Method ${String(message.kind)} not found on handler`);
    }
  }
}
