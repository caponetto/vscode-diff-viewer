import * as vscode from "vscode";
import { ViewedStateStore, ViewedState } from "../viewed-state";

// Mock VS Code ExtensionContext
const createMockExtensionContext = (workspaceState: Map<string, ViewedState | null | undefined> = new Map()) =>
  ({
    workspaceState: {
      get: jest.fn((key: string) => workspaceState.get(key)),
      update: jest.fn((key: string, value: ViewedState) => {
        workspaceState.set(key, value);
        return Promise.resolve();
      }),
    },
    subscriptions: [],
    extensionPath: "",
    globalState: {
      get: jest.fn(),
      update: jest.fn(),
    },
    secrets: {
      get: jest.fn(),
      store: jest.fn(),
      delete: jest.fn(),
    },
    extensionUri: vscode.Uri.file(""),
    globalStorageUri: vscode.Uri.file(""),
    logUri: vscode.Uri.file(""),
    storageUri: vscode.Uri.file(""),
    extensionMode: 1, // ExtensionMode.Test
    isNewInstall: false,
    environmentVariableCollection: {
      persistent: false,
      replace: jest.fn(),
      append: jest.fn(),
      prepend: jest.fn(),
      get: jest.fn(),
      forEach: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    },
    asAbsolutePath: jest.fn((relativePath: string) => relativePath),
    storagePath: "",
    globalStoragePath: "",
    logPath: "",
    languageModelAccessInformation: {
      canSendRequest: jest.fn(),
      canAccessModels: jest.fn(),
    },
    extension: {
      id: "test-extension",
      extensionPath: "",
      isActive: true,
      packageJSON: {},
      extensionKind: 1, // ExtensionKind.Workspace
      exports: {},
    },
  }) as unknown as vscode.ExtensionContext;

describe("ViewedStateStore", () => {
  let mockContext: vscode.ExtensionContext;
  let workspaceState: Map<string, ViewedState | null | undefined>;

  beforeEach(() => {
    workspaceState = new Map();
    mockContext = createMockExtensionContext(workspaceState);
  });

  describe("constructor", () => {
    it("should initialize with docId and context", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      expect(store).toBeInstanceOf(ViewedStateStore);
    });

    it("should initialize without docId", () => {
      const store = new ViewedStateStore({ context: mockContext });

      expect(store).toBeInstanceOf(ViewedStateStore);
    });
  });

  describe("getViewedState", () => {
    it("should return transient state when no docId is provided", () => {
      const store = new ViewedStateStore({ context: mockContext });

      const result = store.getViewedState();

      expect(result).toEqual({});
    });

    it("should return saved state when docId is provided and state exists", () => {
      const docId = "test-doc-id";
      const savedState: ViewedState = { "file1.ts": "sha1-abc123", "file2.ts": "sha1-def456" };
      workspaceState.set(docId, savedState);

      const store = new ViewedStateStore({ docId, context: mockContext });

      const result = store.getViewedState();

      expect(result).toEqual(savedState);
      expect(mockContext.workspaceState.get).toHaveBeenCalledWith(docId);
    });

    it("should return transient state when docId is provided but no saved state exists", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      const result = store.getViewedState();

      expect(result).toEqual({});
      expect(mockContext.workspaceState.get).toHaveBeenCalledWith(docId);
    });

    it("should return transient state when saved state is null", () => {
      const docId = "test-doc-id";
      workspaceState.set(docId, null);

      const store = new ViewedStateStore({ docId, context: mockContext });

      const result = store.getViewedState();

      expect(result).toEqual({});
    });

    it("should return transient state when saved state is undefined", () => {
      const docId = "test-doc-id";
      workspaceState.set(docId, undefined);

      const store = new ViewedStateStore({ docId, context: mockContext });

      const result = store.getViewedState();

      expect(result).toEqual({});
    });
  });

  describe("toggleViewedState", () => {
    it("should add viewed state when viewedSha1 is provided", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-abc123" });

      const result = store.getViewedState();
      expect(result).toEqual({ "file1.ts": "sha1-abc123" });
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(docId, { "file1.ts": "sha1-abc123" });
    });

    it("should remove viewed state when viewedSha1 is null", () => {
      const docId = "test-doc-id";
      const initialState: ViewedState = { "file1.ts": "sha1-abc123", "file2.ts": "sha1-def456" };
      workspaceState.set(docId, initialState);

      const store = new ViewedStateStore({ docId, context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: null });

      const result = store.getViewedState();
      expect(result).toEqual({ "file2.ts": "sha1-def456" });
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(docId, { "file2.ts": "sha1-def456" });
    });

    it("should remove viewed state when viewedSha1 is undefined", () => {
      const docId = "test-doc-id";
      const initialState: ViewedState = { "file1.ts": "sha1-abc123", "file2.ts": "sha1-def456" };
      workspaceState.set(docId, initialState);

      const store = new ViewedStateStore({ docId, context: mockContext });

      // Test with undefined by casting to the expected type
      store.toggleViewedState({ path: "file1.ts", viewedSha1: undefined as unknown as string | null });

      const result = store.getViewedState();
      expect(result).toEqual({ "file2.ts": "sha1-def456" });
    });

    it("should handle multiple toggles correctly", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      // Add multiple files
      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-abc123" });
      store.toggleViewedState({ path: "file2.ts", viewedSha1: "sha1-def456" });
      store.toggleViewedState({ path: "file3.ts", viewedSha1: "sha1-ghi789" });

      let result = store.getViewedState();
      expect(result).toEqual({
        "file1.ts": "sha1-abc123",
        "file2.ts": "sha1-def456",
        "file3.ts": "sha1-ghi789",
      });

      // Remove one file
      store.toggleViewedState({ path: "file2.ts", viewedSha1: null });

      result = store.getViewedState();
      expect(result).toEqual({
        "file1.ts": "sha1-abc123",
        "file3.ts": "sha1-ghi789",
      });
    });

    it("should work with transient state (no docId)", () => {
      const store = new ViewedStateStore({ context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-abc123" });

      const result = store.getViewedState();
      expect(result).toEqual({ "file1.ts": "sha1-abc123" });
      expect(mockContext.workspaceState.update).not.toHaveBeenCalled();
    });

    it("should handle empty string viewedSha1 as falsy", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: "" });

      const result = store.getViewedState();
      expect(result).toEqual({});
    });

    it("should handle zero as truthy viewedSha1", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: "0" });

      const result = store.getViewedState();
      expect(result).toEqual({ "file1.ts": "0" });
    });
  });

  describe("saveViewedState (private method via public methods)", () => {
    it("should save to workspace state when docId is provided", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-abc123" });

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(docId, { "file1.ts": "sha1-abc123" });
    });

    it("should save to transient state when no docId is provided", () => {
      const store = new ViewedStateStore({ context: mockContext });

      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-abc123" });

      expect(mockContext.workspaceState.update).not.toHaveBeenCalled();

      // Verify the state is stored in transient state
      const result = store.getViewedState();
      expect(result).toEqual({ "file1.ts": "sha1-abc123" });
    });

    it("should update existing state correctly", () => {
      const docId = "test-doc-id";
      const initialState: ViewedState = { "file1.ts": "sha1-abc123" };
      workspaceState.set(docId, initialState);

      const store = new ViewedStateStore({ docId, context: mockContext });

      // Add another file
      store.toggleViewedState({ path: "file2.ts", viewedSha1: "sha1-def456" });

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(docId, {
        "file1.ts": "sha1-abc123",
        "file2.ts": "sha1-def456",
      });
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle special characters in file paths", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      const specialPaths = [
        "file with spaces.ts",
        "file-with-dashes.ts",
        "file_with_underscores.ts",
        "file.with.dots.ts",
        "file/with/slashes.ts",
        "file\\with\\backslashes.ts",
        "file@with#special$chars.ts",
      ];

      specialPaths.forEach((path, index) => {
        store.toggleViewedState({ path, viewedSha1: `sha1-${index}` });
      });

      const result = store.getViewedState();
      specialPaths.forEach((path, index) => {
        expect(result[path]).toBe(`sha1-${index}`);
      });
    });

    it("should handle very long file paths", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      const longPath = "a".repeat(1000) + ".ts";
      const sha1 = "sha1-" + "b".repeat(40);

      store.toggleViewedState({ path: longPath, viewedSha1: sha1 });

      const result = store.getViewedState();
      expect(result[longPath]).toBe(sha1);
    });

    it("should handle very long SHA1 values", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      const path = "file.ts";
      const longSha1 = "sha1-" + "a".repeat(1000);

      store.toggleViewedState({ path, viewedSha1: longSha1 });

      const result = store.getViewedState();
      expect(result[path]).toBe(longSha1);
    });

    it("should handle removing non-existent file paths gracefully", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      // Try to remove a file that doesn't exist
      store.toggleViewedState({ path: "non-existent.ts", viewedSha1: null });

      const result = store.getViewedState();
      expect(result).toEqual({});
    });

    it("should handle updating the same file path multiple times", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      const path = "file.ts";

      // Add file
      store.toggleViewedState({ path, viewedSha1: "sha1-first" });
      expect(store.getViewedState()[path]).toBe("sha1-first");

      // Update same file
      store.toggleViewedState({ path, viewedSha1: "sha1-second" });
      expect(store.getViewedState()[path]).toBe("sha1-second");

      // Update again
      store.toggleViewedState({ path, viewedSha1: "sha1-third" });
      expect(store.getViewedState()[path]).toBe("sha1-third");

      // Remove file
      store.toggleViewedState({ path, viewedSha1: null });
      expect(store.getViewedState()[path]).toBeUndefined();
    });
  });

  describe("integration tests", () => {
    it("should maintain state consistency across multiple operations", () => {
      const docId = "test-doc-id";
      const store = new ViewedStateStore({ docId, context: mockContext });

      // Complex sequence of operations
      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-1" });
      store.toggleViewedState({ path: "file2.ts", viewedSha1: "sha1-2" });
      store.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-1-updated" });
      store.toggleViewedState({ path: "file3.ts", viewedSha1: "sha1-3" });
      store.toggleViewedState({ path: "file2.ts", viewedSha1: null });
      store.toggleViewedState({ path: "file4.ts", viewedSha1: "sha1-4" });

      const finalState = store.getViewedState();
      expect(finalState).toEqual({
        "file1.ts": "sha1-1-updated",
        "file3.ts": "sha1-3",
        "file4.ts": "sha1-4",
      });
    });

    it("should work correctly with multiple store instances sharing the same context", () => {
      const docId = "test-doc-id";
      const store1 = new ViewedStateStore({ docId, context: mockContext });
      const store2 = new ViewedStateStore({ docId, context: mockContext });

      // Store1 adds a file
      store1.toggleViewedState({ path: "file1.ts", viewedSha1: "sha1-1" });

      // Store2 should see the same state
      expect(store2.getViewedState()).toEqual({ "file1.ts": "sha1-1" });

      // Store2 adds another file
      store2.toggleViewedState({ path: "file2.ts", viewedSha1: "sha1-2" });

      // Store1 should see both files
      expect(store1.getViewedState()).toEqual({
        "file1.ts": "sha1-1",
        "file2.ts": "sha1-2",
      });
    });
  });
});
