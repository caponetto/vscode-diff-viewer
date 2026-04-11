import { parse } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import { basename } from "node:path";
import * as vscode from "vscode";
import { MessageToWebview } from "../../../shared/message";
import { extractConfig, isAutoColorScheme, setOutputFormatConfig } from "../../configuration";
import { MessageToExtensionHandlerImpl } from "../../message/handler";
import { buildSkeleton } from "../../skeleton";
import { ViewedStateStore } from "../../viewed-state";
import { DiffViewerProvider } from "..";
import { resolveCssUris } from "../shell";

// Mock dependencies
jest.mock("diff2html");
jest.mock("../../message/handler");
jest.mock("../../viewed-state");
jest.mock("../../skeleton");
jest.mock("../../configuration");
jest.mock("node:path");

// Mock vscode module
jest.mock("vscode", () => ({
  window: {
    registerCustomEditorProvider: jest.fn(),
    showWarningMessage: jest.fn(),
    onDidChangeActiveColorTheme: jest.fn(),
    tabGroups: {
      all: [],
      onDidChangeTabs: jest.fn(),
    },
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
  workspace: {
    onDidChangeTextDocument: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    onDidChangeWorkspaceFolders: jest.fn(),
    onDidCreateFiles: jest.fn(),
    onDidDeleteFiles: jest.fn(),
    onDidRenameFiles: jest.fn(),
    getWorkspaceFolder: jest.fn(),
    workspaceFolders: [],
    fs: {
      stat: jest.fn(),
    },
  },
  Disposable: {
    from: jest.fn(),
  },
  Uri: {
    file: jest.fn(),
    joinPath: jest.fn((base, ...paths) => ({
      fsPath: `${base?.fsPath ?? ""}/${paths.join("/")}`.replaceAll(/\/+/g, "/"),
      path: `${base?.path ?? base?.fsPath ?? ""}/${paths.join("/")}`.replaceAll(/\/+/g, "/"),
    })),
  },
  Range: jest.fn(),
  TabInputTextDiff: class {
    public constructor(
      public original: { toString: () => string },
      public modified: { toString: () => string },
    ) {}
  },
}));

const mockParse = parse as jest.MockedFunction<typeof parse>;
const mockBasename = basename as jest.MockedFunction<typeof basename>;
const mockBuildSkeleton = buildSkeleton as jest.MockedFunction<typeof buildSkeleton>;
const mockExtractConfig = extractConfig as jest.MockedFunction<typeof extractConfig>;
const mockIsAutoColorScheme = isAutoColorScheme as jest.MockedFunction<typeof isAutoColorScheme>;
const mockSetOutputFormatConfig = setOutputFormatConfig as jest.MockedFunction<typeof setOutputFormatConfig>;

describe("DiffViewerProvider", () => {
  let mockExtensionContext: vscode.ExtensionContext;
  let mockWebviewPanel: vscode.WebviewPanel;
  let mockWebview: vscode.Webview;
  let mockTextDocument: vscode.TextDocument;
  let mockCancellationToken: vscode.CancellationToken;
  let mockViewedStateStore: jest.Mocked<ViewedStateStore>;
  let mockMessageHandler: jest.Mocked<MessageToExtensionHandlerImpl>;
  let provider: DiffViewerProvider;

  const mockWebviewPath = "webview/path";
  const mockDiffContent =
    "diff --git a/file1.txt b/file1.txt\nindex 1234567..abcdefg 100644\n--- a/file1.txt\n+++ b/file1.txt\n@@ -1,3 +1,3 @@\n line1\n-line2\n+line2modified\n line3";

  beforeEach(() => {
    jest.clearAllMocks();
    (
      vscode.window.tabGroups as unknown as {
        all: Array<{ tabs: Array<{ input: unknown }> }>;
        onDidChangeTabs: jest.Mock;
      }
    ).all = [];
    (
      vscode.window.tabGroups as unknown as {
        all: Array<{ tabs: Array<{ input: unknown }> }>;
        onDidChangeTabs: jest.Mock;
      }
    ).onDidChangeTabs = jest.fn().mockReturnValue({ dispose: jest.fn() });

    (vscode.Uri.file as jest.Mock).mockImplementation((path: string) => ({
      fsPath: path,
      path,
      scheme: "file",
      toString: () => path,
      with: jest.fn(),
    }));

    // Mock extension context
    mockExtensionContext = {
      extensionUri: vscode.Uri.file("/extension/path"),
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    // Mock webview
    mockWebview = {
      postMessage: jest.fn(),
      options: {},
      cspSource: "vscode-webview:",
      asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
      onDidReceiveMessage: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Mock webview panel
    mockWebviewPanel = {
      webview: mockWebview,
      active: true,
      visible: true,
      dispose: jest.fn(),
      onDidDispose: jest.fn(),
      onDidChangeViewState: jest.fn(),
    } as unknown as vscode.WebviewPanel;

    // Mock text document
    mockTextDocument = {
      uri: {
        fsPath: "/workspace/test.diff",
        scheme: "file",
        query: "",
        toString: jest.fn().mockReturnValue("file:///workspace/test.diff"),
      },
      fileName: "test.diff",
      getText: jest.fn().mockReturnValue(mockDiffContent),
    } as unknown as vscode.TextDocument;

    // Mock cancellation token
    mockCancellationToken = {
      isCancellationRequested: false,
    } as unknown as vscode.CancellationToken;

    // Mock viewed state store
    mockViewedStateStore = {
      getViewedState: jest.fn().mockReturnValue({}),
      clearViewedState: jest.fn(),
    } as unknown as jest.Mocked<ViewedStateStore>;

    // Mock message handler
    mockMessageHandler = {
      onMessageReceived: jest.fn(),
      requestWebviewAction: jest.fn(),
    } as unknown as jest.Mocked<MessageToExtensionHandlerImpl>;

    // Mock constructors
    jest.mocked(MessageToExtensionHandlerImpl).mockImplementation(() => mockMessageHandler);
    jest.mocked(ViewedStateStore).mockImplementation(() => mockViewedStateStore);

    // Setup default mocks
    mockParse.mockReturnValue([
      {
        blocks: [],
        newName: "file1.txt",
        oldName: "file1.txt",
        addedLines: 0,
        deletedLines: 0,
        isCombined: false,
        isGitDiff: true,
        language: "typescript",
      },
    ]);
    mockBasename.mockReturnValue("test.diff");
    mockBuildSkeleton.mockReturnValue("<html>mock skeleton</html>");
    (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});
    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue({
      uri: { fsPath: "/workspace", path: "/workspace", scheme: "file", with: jest.fn() },
    });
    mockExtractConfig.mockReturnValue({
      globalScrollbar: false,
      diff2html: {
        outputFormat: "side-by-side",
        drawFileList: true,
        matching: "none",
        matchWordsThreshold: 0.25,
        matchingMaxComparisons: 2500,
        maxLineSizeInBlockForComparison: 200,
        maxLineLengthHighlight: 10000,
        renderNothingWhenEmpty: false,
        colorScheme: ColorSchemeType.LIGHT,
      },
    });
    mockIsAutoColorScheme.mockReturnValue(false);

    provider = new DiffViewerProvider({
      extensionContext: mockExtensionContext,
      webviewPath: mockWebviewPath,
    });
  });

  describe("constructor", () => {
    it("should initialize with provided arguments", () => {
      const args = {
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      };

      const newProvider = new DiffViewerProvider(args);
      expect(newProvider).toBeInstanceOf(DiffViewerProvider);
    });
  });

  describe("registerContributions", () => {
    let mockRegisterCustomEditorProvider: jest.Mock;
    let mockRegisterCommand: jest.Mock;

    beforeEach(() => {
      mockRegisterCustomEditorProvider = jest.fn().mockReturnValue({ dispose: jest.fn() });
      mockRegisterCommand = jest.fn().mockReturnValue({ dispose: jest.fn() });

      // Setup mocked vscode functions
      (vscode.window.registerCustomEditorProvider as jest.Mock) = mockRegisterCustomEditorProvider;
      (vscode.commands.registerCommand as jest.Mock) = mockRegisterCommand;
    });

    it("should register custom editor provider and commands", () => {
      const disposables = DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      expect(disposables).toHaveLength(9);
      expect(mockRegisterCustomEditorProvider).toHaveBeenCalledWith("diffViewer", expect.any(DiffViewerProvider), {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
        supportsMultipleEditorsPerDocument: false,
      });
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.showLineByLine", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.showSideBySide", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.expandAll", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.collapseAll", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.showRaw", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.openCollapsed", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer._captureActiveTestState", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer._runActiveTestAction", expect.any(Function));
    });

    it.each([
      ["showSideBySide", "side-by-side"],
      ["showLineByLine", "line-by-line"],
    ])("should call setOutputFormatConfig when commands are executed", (cmd, expectedConfig) => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      // Get the command function
      const command = mockRegisterCommand.mock.calls.find((c) => c[0] == `diffviewer.${cmd}`)[1];

      // Execute commands
      command();

      expect(mockSetOutputFormatConfig).toHaveBeenCalledWith(expectedConfig);
    });

    it("should open a diff with all files collapsed", () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      // Get the command function
      const command = mockRegisterCommand.mock.calls.find((c) => c[0] == `diffviewer.openCollapsed`)[1];

      (vscode.Uri.file as jest.Mock).mockReturnValueOnce({ with: jest.fn().mockReturnValue("uri-with-selected") });

      // Execute commands
      command(vscode.Uri.file("foo.patch"));

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.openWith", "uri-with-selected", "diffViewer");
    });

    it.each([
      ["expandAll", "expandAll"],
      ["collapseAll", "collapseAll"],
    ])("should post webview action when %s command is executed", (commandId, expectedAction) => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      const command = mockRegisterCommand.mock.calls.find((c) => c[0] === `diffviewer.${commandId}`)?.[1];
      expect(command).toBeDefined();
      const registeredProvider = mockRegisterCustomEditorProvider.mock.calls[0]?.[1] as DiffViewerProvider;

      const activePanel = {
        active: true,
        visible: true,
        webview: {
          postMessage: jest.fn(),
        },
      } as unknown as vscode.WebviewPanel;

      Reflect.set(registeredProvider, "activeWebviewContext", {
        panel: activePanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
      });
      command();

      expect(activePanel.webview.postMessage).toHaveBeenCalledWith({
        kind: "performWebviewAction",
        payload: { action: expectedAction },
      });
    });

    it("should reopen the active diff document with the default editor when showRaw is executed", () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      const command = mockRegisterCommand.mock.calls.find((c) => c[0] === "diffviewer.showRaw")?.[1];
      const registeredProvider = mockRegisterCustomEditorProvider.mock.calls[0]?.[1] as DiffViewerProvider;
      const activePanel = {
        active: true,
        visible: true,
        webview: {
          postMessage: jest.fn(),
        },
      } as unknown as vscode.WebviewPanel;

      Reflect.set(registeredProvider, "activeWebviewContext", {
        panel: activePanel,
        document: mockTextDocument,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
      });

      command();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.openWith", mockTextDocument.uri, "default");
      expect(activePanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it("should clear stored viewed state before posting expand action", () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      const command = mockRegisterCommand.mock.calls.find((c) => c[0] === "diffviewer.expandAll")?.[1];
      const registeredProvider = mockRegisterCustomEditorProvider.mock.calls[0]?.[1] as DiffViewerProvider;
      const activePanel = {
        active: true,
        visible: true,
        webview: {
          postMessage: jest.fn(),
        },
      } as unknown as vscode.WebviewPanel;

      Reflect.set(registeredProvider, "activeWebviewContext", {
        panel: activePanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
      });

      command();

      expect(mockViewedStateStore.clearViewedState).toHaveBeenCalled();
    });

    it("should ignore webview actions when there is no target context", () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      const command = mockRegisterCommand.mock.calls.find((c) => c[0] === "diffviewer.collapseAll")?.[1];
      expect(command).toBeDefined();

      command();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("should capture test state from the active webview context", async () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      const command = mockRegisterCommand.mock.calls.find((c) => c[0] === "diffviewer._captureActiveTestState")?.[1];
      const registeredProvider = mockRegisterCustomEditorProvider.mock.calls[0]?.[1] as DiffViewerProvider;
      const activePanel = {
        active: true,
        visible: true,
        webview: {
          postMessage: jest.fn(),
        },
      } as unknown as vscode.WebviewPanel;
      const expectedState = {
        isReady: true,
        shellGeneration: 1,
        outputFormat: "line-by-line",
        fileCount: 1,
        filePaths: ["src/file.ts"],
        fileHeaders: ["src/file.ts"],
        fileListVisible: true,
        collapsedFilePaths: [],
        scrollbarVisible: false,
        inlineHighlightCount: 0,
        lightHighlightDisabled: false,
        darkHighlightDisabled: true,
        codeLineTexts: ["content"],
      };

      Reflect.set(registeredProvider, "activeWebviewContext", {
        panel: activePanel,
        document: mockTextDocument,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      });

      const testStatePromise = command();
      expect(activePanel.webview.postMessage).toHaveBeenCalledWith({
        kind: "captureTestState",
        payload: { requestId: "test-state-1" },
      });

      (
        registeredProvider as unknown as {
          onTestStateReported: (
            webviewContext: unknown,
            payload: { requestId: string; state: typeof expectedState },
          ) => void;
        }
      ).onTestStateReported(Reflect.get(registeredProvider, "activeWebviewContext"), {
        requestId: "test-state-1",
        state: expectedState,
      });

      await expect(testStatePromise).resolves.toEqual(expectedState);
    });

    it("should run a test action against the active webview context", async () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      const command = mockRegisterCommand.mock.calls.find((c) => c[0] === "diffviewer._runActiveTestAction")?.[1];
      const registeredProvider = mockRegisterCustomEditorProvider.mock.calls[0]?.[1] as DiffViewerProvider;
      const activePanel = {
        active: true,
        visible: true,
        webview: {
          postMessage: jest.fn(),
        },
      } as unknown as vscode.WebviewPanel;

      Reflect.set(registeredProvider, "activeWebviewContext", {
        panel: activePanel,
        document: mockTextDocument,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      });

      const actionPromise = command({ kind: "clickFileName", path: "src/file.ts" });
      expect(activePanel.webview.postMessage).toHaveBeenCalledWith({
        kind: "runTestAction",
        payload: {
          requestId: "test-action-1",
          action: { kind: "clickFileName", path: "src/file.ts" },
        },
      });

      (
        registeredProvider as unknown as {
          onTestActionResultReported: (webviewContext: unknown, payload: { requestId: string; error?: string }) => void;
        }
      ).onTestActionResultReported(Reflect.get(registeredProvider, "activeWebviewContext"), {
        requestId: "test-action-1",
      });

      await expect(actionPromise).resolves.toBeUndefined();
    });
  });

  describe("resolveCustomTextEditor", () => {
    beforeEach(() => {
      // Mock setTimeout to execute immediately
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return early if cancellation is requested", async () => {
      mockCancellationToken.isCancellationRequested = true;

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });

    it("should setup webview without posting render messages before it is ready", async () => {
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(mockWebview.postMessage).not.toHaveBeenCalled();
      expect(mockWebview.options).toEqual({
        enableScripts: true,
      });
    });

    it("should create ViewedStateStore with correct parameters", async () => {
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(ViewedStateStore).toHaveBeenCalledWith({
        context: mockExtensionContext,
        docId: mockTextDocument.uri.fsPath,
      });
    });

    it("should create MessageToExtensionHandlerImpl with correct parameters", async () => {
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(MessageToExtensionHandlerImpl).toHaveBeenCalledWith({
        diffDocument: mockTextDocument,
        viewedStateStore: expect.any(Object),
        onWebviewActionRequested: expect.any(Function),
        onReadyReceived: expect.any(Function),
        onTestStateReported: expect.any(Function),
        onTestActionResultReported: expect.any(Function),
      });
    });

    it("should route requested webview actions back through the provider", async () => {
      const performWebviewActionSpy = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(provider as any, "performWebviewAction")
        .mockImplementation(() => undefined);

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      const constructorArgs = jest.mocked(MessageToExtensionHandlerImpl).mock.calls[0]?.[0];
      constructorArgs?.onWebviewActionRequested("collapseAll");

      expect(performWebviewActionSpy).toHaveBeenCalledWith("collapseAll", expect.any(Object));
    });

    it("should register event handlers and update webview", async () => {
      const mockOnDidChangeTextDocument = jest.fn();
      const mockOnDidReceiveMessage = jest.fn();
      const mockOnDidChangeConfiguration = jest.fn();

      // Setup mocked vscode event listeners
      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;

      // Setup webview panel mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebviewPanel.webview as any).onDidReceiveMessage = mockOnDidReceiveMessage;

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(mockOnDidChangeTextDocument).toHaveBeenCalled();
      expect(mockOnDidReceiveMessage).toHaveBeenCalled();
      expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
    });

    it("should handle diff parsing and webview update", async () => {
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);
      const constructorArgs = jest.mocked(MessageToExtensionHandlerImpl).mock.calls.at(-1)?.[0];
      constructorArgs?.onReadyReceived?.({ shellGeneration: 1 });

      // Fast-forward timers to execute setTimeout
      await jest.runAllTimersAsync();

      expect(mockTextDocument.getText).toHaveBeenCalled();
      expect(mockParse).toHaveBeenCalledWith(mockDiffContent, expect.any(Object));
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "prepare",
      });
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "updateWebview",
        payload: {
          config: expect.any(Object),
          diffFiles: expect.any(Array),
          accessiblePaths: expect.any(Array),
          viewedState: expect.any(Object),
          collapseAll: false,
          performance: expect.any(Object),
        },
      });
    });

    it("should swallow parse failures and fall back to the default editor", async () => {
      mockParse.mockImplementation(() => {
        throw new Error("parse failed");
      });
      mockWebviewPanel.dispose = jest.fn();

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);
      const constructorArgs = jest.mocked(MessageToExtensionHandlerImpl).mock.calls.at(-1)?.[0];
      constructorArgs?.onReadyReceived?.({ shellGeneration: 1 });
      await jest.runAllTimersAsync();

      expect(mockWebviewPanel.dispose).toHaveBeenCalled();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Unable to render "test.diff" as a diff.');
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vscode.openWith", mockTextDocument.uri, "default");
    });

    it("should dispose panel and show warning for invalid diff content", async () => {
      mockParse.mockReturnValue([]);
      const mockDispose = jest.fn();
      const mockShowWarningMessage = jest.fn();
      const mockExecuteCommand = jest.fn();

      mockWebviewPanel.dispose = mockDispose;
      (vscode.window.showWarningMessage as jest.Mock) = mockShowWarningMessage;
      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);
      const constructorArgs = jest.mocked(MessageToExtensionHandlerImpl).mock.calls.at(-1)?.[0];
      constructorArgs?.onReadyReceived?.({ shellGeneration: 1 });

      await jest.runAllTimersAsync();

      expect(mockDispose).toHaveBeenCalled();
      expect(mockShowWarningMessage).toHaveBeenCalledWith('No diff structure found in the file "test.diff".');
      expect(mockExecuteCommand).toHaveBeenCalledWith("vscode.openWith", mockTextDocument.uri, "default");
    });

    it("should not dispose panel for empty diff content", async () => {
      mockParse.mockReturnValue([]);
      const mockDispose = jest.fn();
      const mockShowWarningMessage = jest.fn();

      mockTextDocument.getText = jest.fn().mockReturnValue("");
      mockWebviewPanel.dispose = mockDispose;
      (vscode.window.showWarningMessage as jest.Mock) = mockShowWarningMessage;
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);
      const constructorArgs = jest.mocked(MessageToExtensionHandlerImpl).mock.calls.at(-1)?.[0];
      constructorArgs?.onReadyReceived?.({ shellGeneration: 1 });

      await jest.runAllTimersAsync();

      expect(mockDispose).not.toHaveBeenCalled();
      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe("resolveCssUris", () => {
    it("should return CSS URIs in correct order for light theme", () => {
      const cssUris = resolveCssUris({
        providerArgs: {
          extensionContext: mockExtensionContext,
          webviewPath: mockWebviewPath,
        },
        webview: mockWebview,
      });

      expect(cssUris.commonCssUris).toHaveLength(4);
      expect(cssUris.lightHighlightCssUri).toBeDefined();
      expect(cssUris.darkHighlightCssUri).toBeDefined();
      expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(6);
    });

    it("should return CSS URIs in correct order for dark theme", () => {
      const cssUris = resolveCssUris({
        providerArgs: {
          extensionContext: mockExtensionContext,
          webviewPath: mockWebviewPath,
        },
        webview: mockWebview,
      });

      expect(cssUris.commonCssUris).toHaveLength(4);
      expect(cssUris.lightHighlightCssUri).toBeDefined();
      expect(cssUris.darkHighlightCssUri).toBeDefined();
      expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(6);
    });
  });

  describe("postMessageToWebviewWrapper", () => {
    it("should post message to webview", () => {
      const message: MessageToWebview = {
        kind: "prepare",
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).postMessageToWebviewWrapper({
        webview: mockWebview,
        message,
      });

      expect(mockWebview.postMessage).toHaveBeenCalledWith(message);
    });
  });

  describe("updateWebview", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should build the shell and defer rendering until the webview is ready", () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: false,
        shellGeneration: 0,
        webviewReady: false,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);

      expect(mockExtractConfig).toHaveBeenCalled();
      expect(mockBuildSkeleton).toHaveBeenCalled();
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
      expect(
        (webviewContext as typeof webviewContext & { pendingReadyRender?: { collapseAll: boolean } })
          .pendingReadyRender,
      ).toEqual({
        collapseAll: false,
      });
    });

    it("should handle webview update after the webview is ready", async () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);

      await jest.runAllTimersAsync();

      expect(mockTextDocument.getText).toHaveBeenCalled();
      expect(mockParse).toHaveBeenCalled();
      expect(mockViewedStateStore.getViewedState).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "updateWebview",
        payload: expect.objectContaining({
          config: expect.any(Object),
          diffFiles: expect.any(Array),
          accessiblePaths: expect.any(Array),
          viewedState: expect.any(Object),
          performance: expect.any(Object),
        }),
      });
    });

    it("should keep the chosen output format and collapse large diffs", async () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      };

      mockTextDocument.getText = jest.fn().mockReturnValue("x".repeat(600000));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);

      await jest.runAllTimersAsync();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "updateWebview",
        payload: expect.objectContaining({
          collapseAll: true,
          config: expect.objectContaining({
            diff2html: expect.objectContaining({
              outputFormat: "side-by-side",
            }),
          }),
          accessiblePaths: expect.any(Array),
          performance: expect.objectContaining({
            isLargeDiff: true,
            deferViewedStateHashing: true,
          }),
        }),
      });
    });

    it("should only include accessible paths in the webview payload", async () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      };

      mockParse.mockReturnValue([
        {
          blocks: [],
          newName: "src/file.ts",
          oldName: "src/file.ts",
          addedLines: 0,
          deletedLines: 0,
          isCombined: false,
          isGitDiff: true,
          language: "typescript",
        },
        {
          blocks: [],
          newName: "src/missing.ts",
          oldName: "/dev/null",
          addedLines: 1,
          deletedLines: 0,
          isCombined: false,
          isGitDiff: true,
          language: "typescript",
        },
      ]);

      (vscode.Uri.joinPath as jest.Mock).mockImplementation((base, ...paths) => ({
        fsPath: `${base.fsPath}/${paths.join("/")}`,
        path: `${base.fsPath}/${paths.join("/")}`,
      }));
      (vscode.workspace.fs.stat as jest.Mock).mockImplementation(async (uri: { fsPath: string }) => {
        if (uri.fsPath.includes("missing.ts")) {
          throw new Error("missing");
        }

        return {};
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);

      await jest.runAllTimersAsync();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "updateWebview",
        payload: expect.objectContaining({
          accessiblePaths: ["src/file.ts"],
        }),
      });
    });

    it("should skip posting when the render becomes stale after parsing", async () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      };

      mockParse.mockImplementation(() => {
        webviewContext.renderRequestId = 99;
        return [
          {
            blocks: [],
            newName: "file1.txt",
            oldName: "file1.txt",
            addedLines: 0,
            deletedLines: 0,
            isCombined: false,
            isGitDiff: true,
            language: "typescript",
          },
        ];
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);
      await jest.runAllTimersAsync();

      expect(mockWebview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "updateWebview",
        }),
      );
    });

    it("should reuse cached accessible paths for the same diff-path set", async () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 1,
        webviewReady: true,
      };

      mockParse.mockReturnValue([
        {
          blocks: [],
          newName: "src/file.ts",
          oldName: "src/file.ts",
          addedLines: 0,
          deletedLines: 0,
          isCombined: false,
          isGitDiff: true,
          language: "typescript",
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);
      await jest.runAllTimersAsync();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);
      await jest.runAllTimersAsync();

      expect(vscode.workspace.fs.stat).toHaveBeenCalledTimes(1);
    });
  });

  describe("registerEventHandlers", () => {
    it("should register text document change handler", () => {
      const mockOnDidChangeTextDocument = jest.fn();
      const mockOnDidReceiveMessage = jest.fn();
      const mockOnDidChangeConfiguration = jest.fn();
      const mockOnDidChangeWorkspaceFolders = jest.fn();
      const mockOnDidCreateFiles = jest.fn();
      const mockOnDidDeleteFiles = jest.fn();
      const mockOnDidRenameFiles = jest.fn();
      const mockOnDidChangeActiveColorTheme = jest.fn();

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = mockOnDidChangeWorkspaceFolders;
      (vscode.workspace.onDidCreateFiles as jest.Mock) = mockOnDidCreateFiles;
      (vscode.workspace.onDidDeleteFiles as jest.Mock) = mockOnDidDeleteFiles;
      (vscode.workspace.onDidRenameFiles as jest.Mock) = mockOnDidRenameFiles;
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = mockOnDidChangeActiveColorTheme;

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
      };

      const messageHandler = {
        onMessageReceived: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // Setup webview panel mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebviewPanel.webview as any).onDidReceiveMessage = mockOnDidReceiveMessage;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler });

      expect(mockOnDidChangeTextDocument).toHaveBeenCalled();
      expect(mockOnDidReceiveMessage).toHaveBeenCalled();
      expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
      expect(mockOnDidChangeWorkspaceFolders).toHaveBeenCalled();
      expect(mockOnDidCreateFiles).toHaveBeenCalled();
      expect(mockOnDidDeleteFiles).toHaveBeenCalled();
      expect(mockOnDidRenameFiles).toHaveBeenCalled();
      expect(mockOnDidChangeActiveColorTheme).toHaveBeenCalled();
    });

    it("should ignore malformed messages from the webview", () => {
      const mockOnDidChangeTextDocument = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const mockOnDidChangeConfiguration = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebview as any).onDidReceiveMessage = jest.fn((cb: (message: unknown) => void) => {
        cb({ invalid: true });
        return { dispose: jest.fn() };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebviewPanel as any).onDidDispose = jest.fn();
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(mockMessageHandler.onMessageReceived).not.toHaveBeenCalled();
    });

    it("should ignore thrown handler errors for valid extension messages", () => {
      const mockOnDidChangeTextDocument = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const mockOnDidChangeConfiguration = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const validMessage = { kind: "toggleFileViewed", payload: { path: "src/file.ts", viewedSha1: null } };

      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebview as any).onDidReceiveMessage = jest.fn((cb: (message: unknown) => void) => {
        cb(validMessage);
        return { dispose: jest.fn() };
      });
      mockMessageHandler.onMessageReceived.mockImplementation(() => {
        throw new Error("boom");
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebviewPanel as any).onDidDispose = jest.fn();
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
      };

      const registerEventHandlers = Reflect.get(provider, "registerEventHandlers") as (args: {
        webviewContext: typeof webviewContext;
        messageHandler: typeof mockMessageHandler;
      }) => void;

      expect(() => registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler })).not.toThrow();
      expect(mockMessageHandler.onMessageReceived).toHaveBeenCalledWith(validMessage);
    });

    it("should update webview when active theme changes in auto mode", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeTextDocument = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const mockOnDidChangeConfiguration = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const mockOnDidChangeActiveColorTheme = jest.fn((callback: () => void) => {
        callback();
        return { dispose: jest.fn() };
      });

      mockIsAutoColorScheme.mockReturnValue(true);
      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = mockOnDidChangeActiveColorTheme;
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn(),
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should update the active context and rerender on visible theme-sensitive view state changes", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeViewState = jest.fn((callback: (event: { webviewPanel: vscode.WebviewPanel }) => void) => {
        callback({ webviewPanel: { ...mockWebviewPanel, active: true, visible: true } as vscode.WebviewPanel });
        return { dispose: jest.fn() };
      });

      mockIsAutoColorScheme.mockReturnValue(true);
      mockExtractConfig.mockReturnValue({
        globalScrollbar: false,
        diff2html: {
          outputFormat: "side-by-side",
          drawFileList: true,
          matching: "none",
          matchWordsThreshold: 0.25,
          matchingMaxComparisons: 2500,
          maxLineSizeInBlockForComparison: 200,
          maxLineLengthHighlight: 10000,
          renderNothingWhenEmpty: false,
          colorScheme: ColorSchemeType.DARK,
        },
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidCreateFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidDeleteFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidRenameFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn(),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidChangeViewState", {
        value: mockOnDidChangeViewState,
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        lastRenderedColorScheme: ColorSchemeType.LIGHT,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(Reflect.get(provider, "activeWebviewContext")).toBe(webviewContext);
      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should ignore active theme changes when auto mode is disabled", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeTextDocument = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const mockOnDidChangeConfiguration = jest.fn().mockReturnValue({ dispose: jest.fn() });
      const mockOnDidChangeActiveColorTheme = jest.fn((callback: () => void) => {
        callback();
        return { dispose: jest.fn() };
      });

      mockIsAutoColorScheme.mockReturnValue(false);
      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = mockOnDidChangeActiveColorTheme;
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn(),
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(mockUpdateWebview).not.toHaveBeenCalled();
    });

    it("should only update webview for matching document", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeTextDocument = jest.fn((callback) => {
        // Simulate document change event
        callback({
          document: {
            uri: { fsPath: "/different/path.diff" },
          },
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn();

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
      };

      const messageHandler = {
        onMessageReceived: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler });

      expect(mockUpdateWebview).not.toHaveBeenCalled();
    });

    it("should update webview for matching document", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeTextDocument = jest.fn((callback) => {
        // Simulate document change event for same document
        callback({
          document: mockTextDocument,
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn();

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
      };

      const messageHandler = {
        onMessageReceived: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler });

      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should only update webview for configuration changes affecting app config", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeConfiguration = jest.fn((callback) => {
        // Simulate configuration change event
        callback({
          affectsConfiguration: jest.fn().mockReturnValue(true),
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn();
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
      };

      const messageHandler = {
        onMessageReceived: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler });

      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should clear accessible path cache and update webview when workspace folders change", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeWorkspaceFolders = jest.fn((callback) => {
        callback();
        return { dispose: jest.fn() };
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = mockOnDidChangeWorkspaceFolders;
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn(),
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        accessiblePathsCacheKey: "cached",
        accessiblePathsCache: ["src/file.ts"],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(webviewContext.accessiblePathsCacheKey).toBeUndefined();
      expect(webviewContext.accessiblePathsCache).toBeUndefined();
      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it.each([
      ["file create", "onDidCreateFiles"],
      ["file delete", "onDidDeleteFiles"],
      ["file rename", "onDidRenameFiles"],
    ])("should clear accessible path cache and update webview on %s events", (_, eventName) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockFileEvent = jest.fn((callback: () => void) => {
        callback();
        return { dispose: jest.fn() };
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace[eventName as keyof typeof vscode.workspace] as jest.Mock) = mockFileEvent;
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn(),
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        accessiblePathsCacheKey: "cached",
        accessiblePathsCache: ["src/file.ts"],
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(webviewContext.accessiblePathsCacheKey).toBeUndefined();
      expect(webviewContext.accessiblePathsCache).toBeUndefined();
      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should update the active context and rerender on visible theme-sensitive view state changes", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeViewState = jest.fn((callback: (event: { webviewPanel: vscode.WebviewPanel }) => void) => {
        callback({ webviewPanel: { ...mockWebviewPanel, active: true, visible: true } as vscode.WebviewPanel });
        return { dispose: jest.fn() };
      });

      mockIsAutoColorScheme.mockReturnValue(true);
      mockExtractConfig.mockReturnValue({
        globalScrollbar: false,
        diff2html: {
          outputFormat: "side-by-side",
          drawFileList: true,
          matching: "none",
          matchWordsThreshold: 0.25,
          matchingMaxComparisons: 2500,
          maxLineSizeInBlockForComparison: 200,
          maxLineLengthHighlight: 10000,
          renderNothingWhenEmpty: false,
          colorScheme: ColorSchemeType.DARK,
        },
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidCreateFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidDeleteFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidRenameFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn(),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidChangeViewState", {
        value: mockOnDidChangeViewState,
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        lastRenderedColorScheme: ColorSchemeType.LIGHT,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });

      expect(Reflect.get(provider, "activeWebviewContext")).toBe(webviewContext);
      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should rerender when a matching ready event arrives", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 4,
        webviewReady: false,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).onWebviewReady(webviewContext, { shellGeneration: 4 });

      expect(mockUpdateWebview).toHaveBeenCalledWith(webviewContext);
    });

    it("should ignore ready events from stale shell generations", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        shellInitialized: true,
        shellGeneration: 4,
        webviewReady: false,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).onWebviewReady(webviewContext, { shellGeneration: 3 });

      expect(mockUpdateWebview).not.toHaveBeenCalled();
      expect(webviewContext.webviewReady).toBe(false);
    });

    it("should dispose event handlers and clear pending renders on panel disposal", () => {
      const disposeAll = jest.fn();
      let disposeCallback: (() => void) | undefined;

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidCreateFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidDeleteFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidRenameFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.window.onDidChangeActiveColorTheme as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      Object.defineProperty(mockWebview, "onDidReceiveMessage", {
        value: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        configurable: true,
      });
      Object.defineProperty(mockWebviewPanel, "onDidDispose", {
        value: jest.fn((callback: () => void) => {
          disposeCallback = callback;
          return { dispose: jest.fn() };
        }),
        configurable: true,
      });
      (vscode.Disposable.from as jest.Mock) = jest.fn().mockReturnValue({ dispose: disposeAll });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
        isDisposed: false,
        renderRequestId: 0,
        pendingRender: setTimeout(() => undefined, 1000),
      };
      Reflect.set(provider, "activeWebviewContext", webviewContext);
      Reflect.set(provider, "webviewContexts", new Set([webviewContext]));
      const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler: mockMessageHandler });
      disposeCallback?.();

      expect(webviewContext.isDisposed).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(disposeAll).toHaveBeenCalled();
      expect((Reflect.get(provider, "webviewContexts") as Set<unknown>).size).toBe(0);
    });

    it("should not update webview for configuration changes not affecting app config", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview").mockImplementation(() => undefined);
      const mockOnDidChangeConfiguration = jest.fn((callback) => {
        // Simulate configuration change event
        callback({
          affectsConfiguration: jest.fn().mockReturnValue(false),
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn();
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidCreateFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidDeleteFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });
      (vscode.workspace.onDidRenameFiles as jest.Mock) = jest.fn().mockReturnValue({ dispose: jest.fn() });

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
      };

      const messageHandler = {
        onMessageReceived: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).registerEventHandlers({ webviewContext, messageHandler });

      expect(mockUpdateWebview).not.toHaveBeenCalled();
    });
  });
});
