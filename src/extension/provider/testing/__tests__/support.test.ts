import type { MessageToWebview } from "../../../../shared/message";
import type { WebviewTestState } from "../../../../webview/message/testing/api";
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
  const otherContext = {
    ...targetContext,
    panel: {
      webview: {},
    },
  } as WebviewContext;

  function createSupport(
    postMessageToWebview: (args: { message: MessageToWebview }) => void,
    target?: WebviewContext | "none",
  ) {
    return new DiffViewerProviderTestSupport({
      getTargetWebviewContext: () => (target === "none" ? undefined : (target ?? targetContext)),
      postMessageToWebview:
        postMessageToWebview as DiffViewerProviderTestSupportConstructorArgs["postMessageToWebview"],
      timeoutMs: 10_000,
    });
  }

  const createTestState = (overrides: Partial<WebviewTestState> = {}): WebviewTestState => ({
    isReady: true,
    shellGeneration: 0,
    fileCount: 0,
    filePaths: [],
    fileHeaders: [],
    fileListVisible: false,
    collapsedFilePaths: [],
    scrollbarVisible: false,
    inlineHighlightCount: 0,
    lightHighlightDisabled: false,
    darkHighlightDisabled: false,
    codeLineTexts: [],
    ...overrides,
  });

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

  it("rejects immediately when there is no active ready webview", async () => {
    await expect(createSupport(jest.fn(), "none").captureActiveTestState()).rejects.toThrow(
      "No active webview available to capture test state.",
    );
    await expect(
      createSupport(jest.fn(), { ...targetContext, webviewReady: false } as WebviewContext).runActiveTestAction({
        kind: "clickFileName",
        path: "src/file.ts",
      }),
    ).rejects.toThrow("No active webview available to run test action.");
  });

  it("resolves only matching test state reports", async () => {
    const messages: MessageToWebview[] = [];
    const support = createSupport(({ message }) => {
      messages.push(message);
    });

    const request = support.captureActiveTestState();
    expect(messages).toEqual([{ kind: "captureTestState", payload: { requestId: "test-state-1" } }]);

    support.onTestStateReported(otherContext, {
      requestId: "test-state-1",
      state: createTestState({ isReady: false }),
    });
    expect(Reflect.get(support, "pendingTestStateRequests").size).toBe(1);

    const state = createTestState({ shellGeneration: 2, fileCount: 1, filePaths: ["src/file.ts"] });
    support.onTestStateReported(targetContext, { requestId: "test-state-1", state });

    await expect(request).resolves.toBe(state);
    expect(Reflect.get(support, "pendingTestStateRequests").size).toBe(0);
  });

  it("rejects test actions reported with webview errors", async () => {
    const messages: MessageToWebview[] = [];
    const support = createSupport(({ message }) => {
      messages.push(message);
    });

    const request = support.runActiveTestAction({ kind: "clickLineNumber", path: "src/file.ts", line: 12 });
    expect(messages).toEqual([
      {
        kind: "runTestAction",
        payload: { requestId: "test-action-1", action: { kind: "clickLineNumber", path: "src/file.ts", line: 12 } },
      },
    ]);

    support.onTestActionResultReported(targetContext, {
      requestId: "test-action-1",
      error: "No rendered line number 12 found for src/file.ts.",
    });

    await expect(request).rejects.toThrow("No rendered line number 12 found for src/file.ts.");
    expect(Reflect.get(support, "pendingTestActionRequests").size).toBe(0);
  });

  it("rejects pending requests for a disposed context without touching other contexts", async () => {
    const support = createSupport(jest.fn());
    const targetStateRequest = support.captureActiveTestState(targetContext);
    const otherStateRequest = support.captureActiveTestState(otherContext);
    const targetActionRequest = support.runActiveTestAction({ kind: "clickFileName", path: "src/file.ts" });
    const otherActionRequest = support.runActiveTestAction(
      { kind: "toggleViewed", path: "src/other.ts", viewed: true },
      otherContext,
    );

    support.rejectPendingRequests({
      webviewContext: targetContext,
      testStateMessage: "Target state was closed.",
      testActionMessage: "Target action was closed.",
    });

    await expect(targetStateRequest).rejects.toThrow("Target state was closed.");
    await expect(targetActionRequest).rejects.toThrow("Target action was closed.");
    expect(Reflect.get(support, "pendingTestStateRequests").size).toBe(1);
    expect(Reflect.get(support, "pendingTestActionRequests").size).toBe(1);

    support.onTestStateReported(otherContext, {
      requestId: "test-state-2",
      state: createTestState({ shellGeneration: 1 }),
    });
    support.onTestActionResultReported(otherContext, { requestId: "test-action-2" });

    await expect(otherStateRequest).resolves.toEqual(createTestState({ shellGeneration: 1 }));
    await expect(otherActionRequest).resolves.toBeUndefined();
  });
});

type DiffViewerProviderTestSupportConstructorArgs = ConstructorParameters<typeof DiffViewerProviderTestSupport>[0];
