import * as vscode from "vscode";
import { activate, deactivate } from "../index";
import { DiffViewerProvider } from "../provider";

// Mock the provider
jest.mock("../provider");

describe("Extension Index", () => {
  let mockExtensionContext: vscode.ExtensionContext;
  let mockRegisterContributions: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock DiffViewerProvider.registerContributions
    mockRegisterContributions = jest
      .fn()
      .mockReturnValue([{ dispose: jest.fn() }, { dispose: jest.fn() }, { dispose: jest.fn() }]);
    (DiffViewerProvider.registerContributions as jest.Mock) = mockRegisterContributions;

    // Mock extension context
    mockExtensionContext = {
      subscriptions: {
        push: jest.fn(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });

  describe("activate", () => {
    it("should register contributions and add them to context subscriptions", async () => {
      await activate(mockExtensionContext);

      expect(DiffViewerProvider.registerContributions).toHaveBeenCalledWith({
        extensionContext: mockExtensionContext,
        webviewPath: "dist/webview.js",
      });
      expect(mockExtensionContext.subscriptions.push).toHaveBeenCalledTimes(1);
    });

    it("should handle empty contributions array", async () => {
      mockRegisterContributions.mockReturnValue([]);

      await activate(mockExtensionContext);

      expect(DiffViewerProvider.registerContributions).toHaveBeenCalledWith({
        extensionContext: mockExtensionContext,
        webviewPath: "dist/webview.js",
      });
      expect(mockExtensionContext.subscriptions.push).toHaveBeenCalledTimes(1);
    });

    it("should handle single contribution", async () => {
      const singleDisposable = { dispose: jest.fn() };
      mockRegisterContributions.mockReturnValue([singleDisposable]);

      await activate(mockExtensionContext);

      expect(DiffViewerProvider.registerContributions).toHaveBeenCalledWith({
        extensionContext: mockExtensionContext,
        webviewPath: "dist/webview.js",
      });
      expect(mockExtensionContext.subscriptions.push).toHaveBeenCalledTimes(1);
    });
  });

  describe("deactivate", () => {
    it("should complete without throwing", () => {
      expect(() => deactivate()).not.toThrow();
    });

    it("should be callable multiple times", () => {
      expect(() => {
        deactivate();
        deactivate();
        deactivate();
      }).not.toThrow();
    });
  });
});
