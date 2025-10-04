import * as vscode from "vscode";
import { MessageToExtensionHandlerImpl } from "../handler";
import { ViewedStateStore } from "../../viewed-state";

describe("MessageToExtensionHandlerImpl", () => {
  let mockDiffDocument: vscode.TextDocument;
  let mockViewedStateStore: jest.Mocked<ViewedStateStore>;
  let mockPostMessageToWebviewFn: jest.Mock;
  let handler: MessageToExtensionHandlerImpl;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock diff document
    mockDiffDocument = {
      uri: {
        fsPath: "/workspace/test.diff",
        scheme: "file",
        with: jest.fn(),
      },
      fileName: "test.diff",
      isUntitled: false,
      languageId: "diff",
      version: 1,
      isDirty: false,
      isClosed: false,
      save: jest.fn(),
      lineAt: jest.fn(),
      offsetAt: jest.fn(),
      positionAt: jest.fn(),
      getText: jest.fn(),
      getWordRangeAtPosition: jest.fn(),
      validatePosition: jest.fn(),
      validateRange: jest.fn(),
    } as unknown as vscode.TextDocument;

    // Create mock viewed state store
    mockViewedStateStore = {
      toggleViewedState: jest.fn(),
      getViewedState: jest.fn(),
    } as unknown as jest.Mocked<ViewedStateStore>;

    // Create mock post message function
    mockPostMessageToWebviewFn = jest.fn();

    // Create handler instance
    handler = new MessageToExtensionHandlerImpl({
      diffDocument: mockDiffDocument,
      viewedStateStore: mockViewedStateStore,
      postMessageToWebviewFn: mockPostMessageToWebviewFn,
    });
  });

  describe("pong", () => {
    it("should execute without throwing", () => {
      expect(() => handler.pong()).not.toThrow();
    });
  });

  describe("openFile", () => {
    const mockUri = { fsPath: "/workspace/test.ts" } as vscode.Uri;

    beforeEach(() => {
      (vscode.Uri.file as jest.Mock).mockReturnValue(mockUri);
      (vscode.Range as jest.Mock).mockImplementation((startLine, startChar, endLine, endChar) => ({
        startLine,
        startChar,
        endLine,
        endChar,
      }));
      (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    });

    it("should open file when file exists at absolute path", async () => {
      const payload = { path: "/absolute/path/test.ts", line: 5 };

      await handler.openFile(payload);

      expect(vscode.Uri.file).toHaveBeenCalledWith("/absolute/path/test.ts");
      expect(vscode.workspace.fs.stat).toHaveBeenCalledWith(mockUri);
      expect(vscode.Range).toHaveBeenCalledWith(4, 0, 4, 0);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", mockUri, {
        selection: { startLine: 4, startChar: 0, endLine: 4, endChar: 0 },
      });
    });

    it("should open file when file exists in workspace", async () => {
      const payload = { path: "relative/path/test.ts" };
      const mockWorkspaceFolder = { uri: { fsPath: "/workspace" } } as vscode.WorkspaceFolder;

      // First call (absolute path) fails, second call (workspace path) succeeds
      (vscode.workspace.fs.stat as jest.Mock)
        .mockRejectedValueOnce(new Error("File not found")) // Absolute path fails
        .mockResolvedValueOnce({}); // Workspace path succeeds

      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockWorkspaceFolder);
      (vscode.Uri.file as jest.Mock).mockReturnValueOnce(mockUri);

      // Mock path.join to return the expected path
      const path = require("path");
      (path.join as jest.Mock).mockReturnValue("/workspace/relative/path/test.ts");

      await handler.openFile(payload);

      expect(path.join).toHaveBeenCalledWith("/workspace", "relative/path/test.ts");
      expect(vscode.Uri.file).toHaveBeenCalledWith("/workspace/relative/path/test.ts");
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", mockUri, {});
    });

    it("should show warning when file does not exist", async () => {
      const payload = { path: "/nonexistent/test.ts" };

      (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error("File not found"));
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);

      await handler.openFile(payload);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Cannot locate the file "test.ts" neither in the workspace nor by the specified path.',
      );
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("should handle file not found in workspace but found by absolute path", async () => {
      const payload = { path: "relative/test.ts" };
      const mockWorkspaceFolder = { uri: { fsPath: "/workspace" } } as vscode.WorkspaceFolder;

      // First call (absolute path) fails
      (vscode.workspace.fs.stat as jest.Mock)
        .mockRejectedValueOnce(new Error("File not found"))
        .mockResolvedValueOnce({}); // Second call (workspace path) succeeds

      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockWorkspaceFolder);
      (vscode.Uri.file as jest.Mock).mockReturnValue(mockUri);

      await handler.openFile(payload);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", mockUri, {});
    });

    it("should handle custom virtual file system workspace", async () => {
      const payload = { path: "test.ts" };
      const mockWorkspaceFolder = { uri: { fsPath: "/workspace" } } as vscode.WorkspaceFolder;

      // Mock workspace schemes
      const mockWorkspaceFolders = [
        { uri: { scheme: "vscode-vfs" } } as vscode.WorkspaceFolder,
        { uri: { scheme: "file" } } as vscode.WorkspaceFolder,
      ];
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: mockWorkspaceFolders,
        writable: true,
      });

      // First call fails for original URI
      (vscode.workspace.getWorkspaceFolder as jest.Mock)
        .mockReturnValueOnce(undefined) // Original URI
        .mockReturnValueOnce(mockWorkspaceFolder); // VFS URI

      (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});
      (vscode.Uri.file as jest.Mock).mockReturnValue(mockUri);

      // Mock the with method to return a modified URI
      (mockDiffDocument.uri.with as jest.Mock).mockReturnValue({
        scheme: "vscode-vfs",
        fsPath: "/workspace/test.diff",
      });

      await handler.openFile(payload);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", mockUri, {});
    });

    it("should not include line selection when line is not provided", async () => {
      const payload = { path: "/absolute/path/test.ts" };

      await handler.openFile(payload);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", mockUri, {});
      expect(vscode.Range).not.toHaveBeenCalled();
    });
  });

  describe("toggleFileViewed", () => {
    it("should call viewedStateStore.toggleViewedState with correct payload", () => {
      const payload = { path: "test.ts", viewedSha1: "abc123" };

      handler.toggleFileViewed(payload);

      expect(mockViewedStateStore.toggleViewedState).toHaveBeenCalledWith(payload);
    });

    it("should handle null viewedSha1", () => {
      const payload = { path: "test.ts", viewedSha1: null };

      handler.toggleFileViewed(payload);

      expect(mockViewedStateStore.toggleViewedState).toHaveBeenCalledWith(payload);
    });
  });

  describe("onMessageReceived", () => {
    it("should route pong message correctly", () => {
      const pongSpy = jest.spyOn(handler, "pong");

      handler.onMessageReceived({ kind: "pong" });

      expect(pongSpy).toHaveBeenCalled();
    });

    it("should route openFile message correctly", async () => {
      const openFileSpy = jest.spyOn(handler, "openFile").mockResolvedValue();

      const payload = { path: "test.ts", line: 5 };
      handler.onMessageReceived({ kind: "openFile", payload });

      expect(openFileSpy).toHaveBeenCalledWith(payload);
    });

    it("should route toggleFileViewed message correctly", () => {
      const toggleSpy = jest.spyOn(handler, "toggleFileViewed");

      const payload = { path: "test.ts", viewedSha1: "abc123" };
      handler.onMessageReceived({ kind: "toggleFileViewed", payload });

      expect(toggleSpy).toHaveBeenCalledWith(payload);
    });

    it("should throw error for unknown message kind", () => {
      expect(() => {
        handler.onMessageReceived({ kind: "unknownMethod" });
      }).toThrow("Method unknownMethod not found on handler");
    });
  });

  describe("error handling", () => {
    it("should handle file system errors gracefully", async () => {
      const payload = { path: "/test.ts" };

      (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error("Permission denied"));
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);

      // Should not throw
      await expect(handler.openFile(payload)).resolves.toBeUndefined();

      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it("should handle workspace folder not found", async () => {
      const payload = { path: "relative/test.ts" };

      (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error("File not found"));
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);

      await handler.openFile(payload);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Cannot locate the file "test.ts" neither in the workspace nor by the specified path.',
      );
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete file opening workflow", async () => {
      const payload = { path: "/workspace/src/test.ts", line: 10 };
      const mockUri = { fsPath: "/workspace/src/test.ts" } as vscode.Uri;

      (vscode.Uri.file as jest.Mock).mockReturnValue(mockUri);
      (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await handler.openFile(payload);

      expect(vscode.Uri.file).toHaveBeenCalledWith("/workspace/src/test.ts");
      expect(vscode.workspace.fs.stat).toHaveBeenCalledWith(mockUri);
      expect(vscode.Range).toHaveBeenCalledWith(9, 0, 9, 0);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", mockUri, {
        selection: expect.any(Object),
      });
    });

    it("should handle message routing for all supported message types", () => {
      const pongSpy = jest.spyOn(handler, "pong");
      const openFileSpy = jest.spyOn(handler, "openFile").mockResolvedValue();
      const toggleSpy = jest.spyOn(handler, "toggleFileViewed");

      // Test all message types
      handler.onMessageReceived({ kind: "pong" });
      handler.onMessageReceived({ kind: "openFile", payload: { path: "test.ts" } });
      handler.onMessageReceived({ kind: "toggleFileViewed", payload: { path: "test.ts", viewedSha1: "abc" } });

      expect(pongSpy).toHaveBeenCalledTimes(1);
      expect(openFileSpy).toHaveBeenCalledTimes(1);
      expect(toggleSpy).toHaveBeenCalledTimes(1);
    });
  });
});
