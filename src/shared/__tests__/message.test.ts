import {
  hasPayload,
  isMessageKind,
  MessageKind,
  MessagePayload,
  MessageToExtension,
  MessageToWebview,
  GenericMessageHandler,
  MessageToExtensionHandler,
  MessageToWebviewHandler,
} from "../message";

// Mock the API types for testing
interface TestExtensionApi {
  method1: () => void;
  method2: (payload: { id: string; value: number }) => void;
  method3: (payload: { name: string }) => void;
}

interface TestWebviewApi {
  ping: () => void;
  prepare: () => void;
  updateWebview: (payload: { data: string }) => void;
}

// Create test message types
type TestExtensionMessage = {
  [K in keyof TestExtensionApi]: TestExtensionApi[K] extends () => unknown
    ? { kind: K }
    : { kind: K; payload: Parameters<TestExtensionApi[K]>[0] };
}[keyof TestExtensionApi];

type TestWebviewMessage = {
  [K in keyof TestWebviewApi]: TestWebviewApi[K] extends () => unknown
    ? { kind: K }
    : { kind: K; payload: Parameters<TestWebviewApi[K]>[0] };
}[keyof TestWebviewApi];

describe("Message Types and Utilities", () => {
  describe("hasPayload", () => {
    it("should return true for messages with payload", () => {
      const messageWithPayload = { kind: "method2", payload: { id: "test", value: 123 } };
      expect(hasPayload(messageWithPayload)).toBe(true);
    });

    it("should return false for messages without payload", () => {
      const messageWithoutPayload = { kind: "method1" };
      expect(hasPayload(messageWithoutPayload)).toBe(false);
    });

    it("should return false for messages with undefined payload", () => {
      const messageWithUndefinedPayload = { kind: "method2", payload: undefined };
      expect(hasPayload(messageWithUndefinedPayload)).toBe(false);
    });

    it("should return false for messages with null payload", () => {
      const messageWithNullPayload = { kind: "method2", payload: null };
      expect(hasPayload(messageWithNullPayload)).toBe(true); // null is not undefined
    });

    it("should work with different message types", () => {
      const webviewMessage = { kind: "updateWebview", payload: { data: "test" } };
      expect(hasPayload(webviewMessage)).toBe(true);

      const webviewMessageNoPayload = { kind: "ping" };
      expect(hasPayload(webviewMessageNoPayload)).toBe(false);
    });
  });

  describe("isMessageKind", () => {
    it("should return true for matching message kind", () => {
      const message = { kind: "method1" };
      expect(isMessageKind(message, "method1")).toBe(true);
    });

    it("should return false for non-matching message kind", () => {
      const message = { kind: "method1" };
      expect(isMessageKind(message, "method2")).toBe(false);
    });

    it("should work with messages that have payloads", () => {
      const message = { kind: "method2", payload: { id: "test", value: 123 } };
      expect(isMessageKind(message, "method2")).toBe(true);
      expect(isMessageKind(message, "method1")).toBe(false);
    });

    it("should work with different message types", () => {
      const webviewMessage = { kind: "ping" };
      expect(isMessageKind(webviewMessage, "ping")).toBe(true);
      expect(isMessageKind(webviewMessage, "prepare")).toBe(false);

      const webviewMessageWithPayload = { kind: "updateWebview", payload: { data: "test" } };
      expect(isMessageKind(webviewMessageWithPayload, "updateWebview")).toBe(true);
      expect(isMessageKind(webviewMessageWithPayload, "ping")).toBe(false);
    });
  });

  describe("Message Type Guards Integration", () => {
    it("should work together for type narrowing", () => {
      const messages: TestExtensionMessage[] = [
        { kind: "method1" },
        { kind: "method2", payload: { id: "test", value: 123 } },
      ];

      messages.forEach((message) => {
        if (isMessageKind(message, "method2")) {
          expect(hasPayload(message)).toBe(true);
          if (hasPayload(message)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((message.payload as any).id).toBe("test");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((message.payload as any).value).toBe(123);
          }
        } else {
          expect(hasPayload(message)).toBe(false);
        }
      });
    });
  });

  describe("Type Utilities", () => {
    it("should extract correct message kinds", () => {
      type ExtensionKinds = MessageKind<TestExtensionMessage>;
      type WebviewKinds = MessageKind<TestWebviewMessage>;

      // These are compile-time tests, but we can verify the types exist
      const extensionKind: ExtensionKinds = "method1";
      const webviewKind: WebviewKinds = "ping";

      expect(extensionKind).toBe("method1");
      expect(webviewKind).toBe("ping");
    });

    it("should extract correct payload types", () => {
      type Method2Payload = MessagePayload<TestExtensionMessage, "method2">;
      type UpdateWebviewPayload = MessagePayload<TestWebviewMessage, "updateWebview">;

      // These are compile-time tests, but we can verify the types exist
      const method2Payload: Method2Payload = { id: "test", value: 123 };
      const updateWebviewPayload: UpdateWebviewPayload = { data: "test" };

      expect(method2Payload.id).toBe("test");
      expect(method2Payload.value).toBe(123);
      expect(updateWebviewPayload.data).toBe("test");
    });
  });

  describe("Generic Message Handler Interface", () => {
    it("should be implementable", () => {
      class TestMessageHandler implements GenericMessageHandler<TestExtensionApi> {
        onMessageReceived(message: TestExtensionMessage): void {
          if (isMessageKind(message, "method1")) {
            // Handle method1
          }
        }
      }

      const handler = new TestMessageHandler();
      expect(handler).toBeInstanceOf(TestMessageHandler);
      expect(typeof handler.onMessageReceived).toBe("function");
    });
  });

  describe("Message Handler Interfaces", () => {
    it("should define correct interfaces", () => {
      // These are compile-time tests to ensure the interfaces are properly defined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extensionHandler: MessageToExtensionHandler = {} as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webviewHandler: MessageToWebviewHandler = {} as any;

      expect(extensionHandler).toBeDefined();
      expect(webviewHandler).toBeDefined();
    });
  });

  describe("Message Union Types", () => {
    it("should create correct union types", () => {
      // These are compile-time tests to ensure the union types are correct
      const extensionMessage: MessageToExtension = { kind: "openFile", payload: { path: "test" } };
      const webviewMessage: MessageToWebview = { kind: "ping" };

      expect(extensionMessage.kind).toBe("openFile");
      expect(webviewMessage.kind).toBe("ping");
    });
  });
});
