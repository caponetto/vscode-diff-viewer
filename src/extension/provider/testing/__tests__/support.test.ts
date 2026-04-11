import type { MessageToWebview } from "../../../../shared/message";
import type { WebviewContext } from "../../types";
import { DiffViewerProviderTestSupport } from "../support";

describe("DiffViewerProviderTestSupport", () => {
  const targetContext = {
    document: {
      uri: {
        toString: () => "file:///workspace/sample.diff",
      },
    },
    isDisposed: false,
    panel: {
      webview: {},
    },
    webviewReady: true,
  } as WebviewContext;

  function createSupport(postMessageToWebview: (args: { message: MessageToWebview }) => void) {
    return new DiffViewerProviderTestSupport({
      getTargetWebviewContext: () => targetContext,
      postMessageToWebview:
        postMessageToWebview as DiffViewerProviderTestSupportConstructorArgs["postMessageToWebview"],
      timeoutMs: 10_000,
    });
  }

  it("cleans up pending test state requests when dispatch throws", async () => {
    const dispatchError = new Error("dispatch failed");
    const support = createSupport(() => {
      throw dispatchError;
    });

    await expect(support.captureActiveTestState()).rejects.toThrow(dispatchError);

    expect(Reflect.get(support, "pendingTestStateRequests").size).toBe(0);
  });

  it("cleans up pending test action requests when dispatch throws", async () => {
    const dispatchError = new Error("dispatch failed");
    const support = createSupport(() => {
      throw dispatchError;
    });

    await expect(support.runActiveTestAction({ kind: "clickFileName", path: "src/file.ts" })).rejects.toThrow(
      dispatchError,
    );

    expect(Reflect.get(support, "pendingTestActionRequests").size).toBe(0);
  });
});

type DiffViewerProviderTestSupportConstructorArgs = ConstructorParameters<typeof DiffViewerProviderTestSupport>[0];
