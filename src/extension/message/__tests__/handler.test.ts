import * as vscode from "vscode";
import { MessageToExtensionHandlerImpl } from "../handler";
import { ViewedStateStore } from "../../viewed-state";

describe("MessageToExtensionHandlerImpl", () => {
  let mockDiffDocument: vscode.TextDocument;
  let mockViewedStateStore: jest.Mocked<ViewedStateStore>;
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
      clearViewedState: jest.fn(),
    } as unknown as jest.Mocked<ViewedStateStore>;

    // Create handler instance
    handler = new MessageToExtensionHandlerImpl({
      diffDocument: mockDiffDocument,
      viewedStateStore: mockViewedStateStore,
      onWebviewActionRequested: jest.fn(),
    });
  });

  describe("ready", () => {
    it("should forward the ready payload to the callback when provided", () => {
      const onReadyReceived = jest.fn();
      handler = new MessageToExtensionHandlerImpl({
        diffDocument: mockDiffDocument,
        viewedStateStore: mockViewedStateStore,
        onWebviewActionRequested: jest.fn(),
        onReadyReceived,
      });

      handler.ready({ shellGeneration: 2 });

      expect(onReadyReceived).toHaveBeenCalledWith({ shellGeneration: 2 });
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
      const mockWorkspaceFolder = { uri: { fsPath: "/workspace", path: "/workspace" } } as vscode.WorkspaceFolder;

      const workspaceUri = { fsPath: "/workspace/relative/path/test.ts", path: "/workspace/relative/path/test.ts" };

      (vscode.workspace.fs.stat as jest.Mock).mockResolvedValueOnce({}); // Workspace path succeeds

      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockWorkspaceFolder);
      (vscode.Uri.joinPath as jest.Mock).mockReturnValue(workspaceUri);

      await handler.openFile(payload);

      expect(vscode.Uri.joinPath).toHaveBeenCalledWith(mockWorkspaceFolder.uri, "relative", "path", "test.ts");
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", workspaceUri, {});
    });

    it("should show warning when file does not exist", async () => {
      const payload = { path: "/nonexistent/test.ts" };

      (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error("File not found"));
      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);

      await handler.openFile(payload);

      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("should handle file not found in workspace but found by absolute path", async () => {
      const payload = { path: "relative/test.ts" };
      const mockWorkspaceFolder = { uri: { fsPath: "/workspace", path: "/workspace" } } as vscode.WorkspaceFolder;
      const workspaceUri = { fsPath: "/workspace/relative/test.ts", path: "/workspace/relative/test.ts" };

      (vscode.workspace.fs.stat as jest.Mock).mockResolvedValueOnce({});

      (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(mockWorkspaceFolder);
      (vscode.Uri.joinPath as jest.Mock).mockReturnValue(workspaceUri);

      await handler.openFile(payload);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", workspaceUri, {});
    });

    it("should handle custom virtual file system workspace", async () => {
      const payload = { path: "test.ts" };
      const mockWorkspaceFolder = {
        uri: { fsPath: "/workspace", path: "/workspace", scheme: "vscode-vfs" },
      } as vscode.WorkspaceFolder;
      const workspaceUri = {
        fsPath: "/workspace/test.ts",
        path: "/workspace/test.ts",
        scheme: "vscode-vfs",
      };

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
      (vscode.Uri.joinPath as jest.Mock).mockReturnValue(workspaceUri);

      // Mock the with method to return a modified URI
      (mockDiffDocument.uri.with as jest.Mock).mockReturnValue({
        scheme: "vscode-vfs",
        fsPath: "/workspace/test.diff",
      });

      await handler.openFile(payload);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.open", workspaceUri, {});
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

  describe("requestWebviewAction", () => {
    it("should forward the requested action to the provider callback", () => {
      const onWebviewActionRequested = jest.fn();
      handler = new MessageToExtensionHandlerImpl({
        diffDocument: mockDiffDocument,
        viewedStateStore: mockViewedStateStore,
        onWebviewActionRequested,
      });

      handler.requestWebviewAction({ action: "expandAll" });

      expect(onWebviewActionRequested).toHaveBeenCalledWith("expandAll");
    });
  });

  describe("onMessageReceived", () => {
    it("should route ready message correctly", () => {
      const readySpy = jest.spyOn(handler, "ready");
      const payload = { shellGeneration: 2 };

      handler.onMessageReceived({ kind: "ready", payload });

      expect(readySpy).toHaveBeenCalledWith(payload);
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

    it("should route requestWebviewAction message correctly", () => {
      const actionSpy = jest.spyOn(handler, "requestWebviewAction");
      const payload = { action: "collapseAll" as const };

      handler.onMessageReceived({ kind: "requestWebviewAction", payload });

      expect(actionSpy).toHaveBeenCalledWith(payload);
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
        'Cannot locate the file "test.ts" in the workspace or at the specified path.',
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
      const readySpy = jest.spyOn(handler, "ready");
      const openFileSpy = jest.spyOn(handler, "openFile").mockResolvedValue();
      const toggleSpy = jest.spyOn(handler, "toggleFileViewed");

      // Test all message types
      handler.onMessageReceived({ kind: "ready", payload: { shellGeneration: 1 } });
      handler.onMessageReceived({ kind: "openFile", payload: { path: "test.ts" } });
      handler.onMessageReceived({ kind: "toggleFileViewed", payload: { path: "test.ts", viewedSha1: "abc" } });

      expect(readySpy).toHaveBeenCalledTimes(1);
      expect(openFileSpy).toHaveBeenCalledTimes(1);
      expect(toggleSpy).toHaveBeenCalledTimes(1);
    });
  });
});
