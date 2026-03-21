/**
 * @jest-environment jsdom
 */

jest.mock("../message/handler", () => ({
  MessageToWebviewHandlerImpl: jest.fn(),
}));

jest.mock("../../shared/message", () => ({
  isMessageToWebview: jest.fn(),
}));

describe("webview/index", () => {
  const addEventListener = jest.fn();
  const postMessage = jest.fn();
  const getState = jest.fn();
  const setState = jest.fn();
  const onMessageReceived = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    Object.defineProperty(globalThis, "origin", {
      value: "http://localhost",
      configurable: true,
    });
    Object.defineProperty(globalThis, "addEventListener", {
      value: addEventListener,
      configurable: true,
    });
    Object.defineProperty(globalThis, "acquireVsCodeApi", {
      value: jest.fn(() => ({ postMessage, getState, setState })),
      configurable: true,
    });
  });

  it("wires the webview API into the message handler", async () => {
    getState.mockReturnValue({ scrollTop: 10 });

    let mockedHandlerConstructor: jest.Mock;
    jest.isolateModules(() => {
      mockedHandlerConstructor = require("../message/handler").MessageToWebviewHandlerImpl as jest.Mock;
      mockedHandlerConstructor.mockImplementation(() => ({
        onMessageReceived,
      }));
      require("../index");
    });

    expect(mockedHandlerConstructor!).toHaveBeenCalledWith({
      postMessageToExtensionFn: expect.any(Function),
      state: {
        getState: expect.any(Function),
        setState: expect.any(Function),
      },
    });

    const args = mockedHandlerConstructor!.mock.calls[0]?.[0];
    args?.postMessageToExtensionFn({ kind: "pong" } as never);
    expect(postMessage).toHaveBeenCalledWith({ kind: "pong" });
    expect(args?.state.getState()).toEqual({ scrollTop: 10 });
    args?.state.setState({ scrollTop: 99 });
    expect(setState).toHaveBeenCalledWith({ scrollTop: 99 });
  });

  it("ignores messages from a different origin", async () => {
    let mockedIsMessageToWebview: jest.Mock;
    jest.isolateModules(() => {
      const mockedHandlerConstructor = require("../message/handler").MessageToWebviewHandlerImpl as jest.Mock;
      mockedHandlerConstructor.mockImplementation(() => ({
        onMessageReceived,
      }));
      mockedIsMessageToWebview = require("../../shared/message").isMessageToWebview as jest.Mock;
      require("../index");
    });

    const messageCallback = addEventListener.mock.calls[0]?.[1] as (event: MessageEvent) => void;
    mockedIsMessageToWebview!.mockReturnValue(true);
    messageCallback({
      origin: "http://different-host",
      data: { kind: "ping" },
    } as MessageEvent);

    expect(onMessageReceived).not.toHaveBeenCalled();
  });

  it("ignores invalid webview messages", async () => {
    let mockedIsMessageToWebview: jest.Mock;
    jest.isolateModules(() => {
      const mockedHandlerConstructor = require("../message/handler").MessageToWebviewHandlerImpl as jest.Mock;
      mockedHandlerConstructor.mockImplementation(() => ({
        onMessageReceived,
      }));
      mockedIsMessageToWebview = require("../../shared/message").isMessageToWebview as jest.Mock;
      require("../index");
    });

    const messageCallback = addEventListener.mock.calls[0]?.[1] as (event: MessageEvent) => void;
    mockedIsMessageToWebview!.mockReturnValue(false);
    messageCallback({
      origin: "http://localhost",
      data: { kind: "invalid" },
    } as MessageEvent);

    expect(mockedIsMessageToWebview!).toHaveBeenCalledWith({ kind: "invalid" });
  });

  it("forwards valid messages and swallows handler exceptions", async () => {
    let mockedIsMessageToWebview: jest.Mock;
    jest.isolateModules(() => {
      const mockedHandlerConstructor = require("../message/handler").MessageToWebviewHandlerImpl as jest.Mock;
      mockedHandlerConstructor.mockImplementation(() => ({
        onMessageReceived,
      }));
      mockedIsMessageToWebview = require("../../shared/message").isMessageToWebview as jest.Mock;
      require("../index");
    });

    const messageCallback = addEventListener.mock.calls[0]?.[1] as (event: MessageEvent) => void;
    mockedIsMessageToWebview!.mockReturnValue(true);
    onMessageReceived.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() =>
      messageCallback({
        origin: "http://localhost",
        data: { kind: "ping" },
      } as MessageEvent),
    ).not.toThrow();

    expect(onMessageReceived).toHaveBeenCalledWith({ kind: "ping" });
  });
});
