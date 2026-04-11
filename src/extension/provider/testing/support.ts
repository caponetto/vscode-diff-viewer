import * as vscode from "vscode";
import { MessageToWebview } from "../../../shared/message";
import { WebviewTestAction, WebviewTestState } from "../../../webview/message/testing/api";
import { WebviewContext } from "../types";

interface PendingTestStateRequest {
  webviewContext: WebviewContext;
  resolve: (state: WebviewTestState) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingTestActionRequest {
  webviewContext: WebviewContext;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class DiffViewerProviderTestSupport {
  private readonly pendingTestStateRequests = new Map<string, PendingTestStateRequest>();
  private readonly pendingTestActionRequests = new Map<string, PendingTestActionRequest>();
  private testStateRequestCounter = 0;
  private testActionRequestCounter = 0;

  public constructor(
    private readonly args: {
      getTargetWebviewContext: () => WebviewContext | undefined;
      postMessageToWebview: (args: { webview: vscode.Webview; message: MessageToWebview }) => void;
      timeoutMs: number;
    },
  ) {}

  public captureActiveTestState(targetContext = this.args.getTargetWebviewContext()): Promise<WebviewTestState> {
    if (!targetContext || targetContext.isDisposed || !targetContext.webviewReady) {
      return Promise.reject(new Error("No active webview available to capture test state."));
    }

    const requestId = `test-state-${++this.testStateRequestCounter}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTestStateRequests.delete(requestId);
        reject(new Error(`Timed out waiting for test state from ${targetContext.document.uri.toString()}.`));
      }, this.args.timeoutMs);

      this.pendingTestStateRequests.set(requestId, {
        webviewContext: targetContext,
        resolve,
        reject,
        timeout,
      });

      this.args.postMessageToWebview({
        webview: targetContext.panel.webview,
        message: {
          kind: "captureTestState",
          payload: { requestId },
        },
      });
    });
  }

  public onTestStateReported(
    webviewContext: WebviewContext,
    payload: { requestId: string; state: WebviewTestState },
  ): void {
    const pendingRequest = this.pendingTestStateRequests.get(payload.requestId);
    if (pendingRequest?.webviewContext !== webviewContext) {
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingTestStateRequests.delete(payload.requestId);
    pendingRequest.resolve(payload.state);
  }

  public runActiveTestAction(
    action: WebviewTestAction,
    targetContext = this.args.getTargetWebviewContext(),
  ): Promise<void> {
    if (!targetContext || targetContext.isDisposed || !targetContext.webviewReady) {
      return Promise.reject(new Error("No active webview available to run test action."));
    }

    const requestId = `test-action-${++this.testActionRequestCounter}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTestActionRequests.delete(requestId);
        reject(
          new Error(`Timed out waiting for test action ${action.kind} on ${targetContext.document.uri.toString()}.`),
        );
      }, this.args.timeoutMs);

      this.pendingTestActionRequests.set(requestId, {
        webviewContext: targetContext,
        resolve,
        reject,
        timeout,
      });

      this.args.postMessageToWebview({
        webview: targetContext.panel.webview,
        message: {
          kind: "runTestAction",
          payload: { requestId, action },
        },
      });
    });
  }

  public onTestActionResultReported(
    webviewContext: WebviewContext,
    payload: { requestId: string; error?: string },
  ): void {
    const pendingRequest = this.pendingTestActionRequests.get(payload.requestId);
    if (pendingRequest?.webviewContext !== webviewContext) {
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingTestActionRequests.delete(payload.requestId);
    if (payload.error) {
      pendingRequest.reject(new Error(payload.error));
      return;
    }

    pendingRequest.resolve();
  }

  public rejectPendingRequests(args: {
    webviewContext: WebviewContext;
    testStateMessage: string;
    testActionMessage: string;
  }): void {
    this.rejectPendingTestStateRequests(args.webviewContext, args.testStateMessage);
    this.rejectPendingTestActionRequests(args.webviewContext, args.testActionMessage);
  }

  private rejectPendingTestStateRequests(webviewContext: WebviewContext, message: string): void {
    for (const [requestId, pendingRequest] of this.pendingTestStateRequests.entries()) {
      if (pendingRequest.webviewContext !== webviewContext) {
        continue;
      }

      clearTimeout(pendingRequest.timeout);
      this.pendingTestStateRequests.delete(requestId);
      pendingRequest.reject(new Error(message));
    }
  }

  private rejectPendingTestActionRequests(webviewContext: WebviewContext, message: string): void {
    for (const [requestId, pendingRequest] of this.pendingTestActionRequests.entries()) {
      if (pendingRequest.webviewContext !== webviewContext) {
        continue;
      }

      clearTimeout(pendingRequest.timeout);
      this.pendingTestActionRequests.delete(requestId);
      pendingRequest.reject(new Error(message));
    }
  }
}
