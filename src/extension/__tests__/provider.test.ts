import { parse } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import { basename } from "path";
import * as vscode from "vscode";
import { DiffViewerProvider } from "../provider";
import { MessageToExtensionHandlerImpl } from "../message/handler";
import { ViewedStateStore } from "../viewed-state";
import { buildSkeleton } from "../skeleton";
import { extractConfig, setOutputFormatConfig } from "../configuration";
import { SkeletonElementIds } from "../../shared/css/elements";
import { MessageToWebview } from "../../shared/message";

// Mock dependencies
jest.mock("diff2html");
jest.mock("../message/handler");
jest.mock("../viewed-state");
jest.mock("../skeleton");
jest.mock("../configuration");
jest.mock("path");

// Mock vscode module
jest.mock("vscode", () => ({
  window: {
    registerCustomEditorProvider: jest.fn(),
    showWarningMessage: jest.fn(),
    tabGroups: {
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
  },
  Disposable: {
    from: jest.fn(),
  },
  Uri: {
    file: jest.fn(),
    joinPath: jest.fn((...paths) => ({ fsPath: paths.join("/") })),
  },
  Range: jest.fn(),
}));

const mockParse = parse as jest.MockedFunction<typeof parse>;
const mockBasename = basename as jest.MockedFunction<typeof basename>;
const mockBuildSkeleton = buildSkeleton as jest.MockedFunction<typeof buildSkeleton>;
const mockExtractConfig = extractConfig as jest.MockedFunction<typeof extractConfig>;
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
      asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
      onDidReceiveMessage: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // Mock webview panel
    mockWebviewPanel = {
      webview: mockWebview,
      onDidDispose: jest.fn(),
    } as unknown as vscode.WebviewPanel;

    // Mock text document
    mockTextDocument = {
      uri: {
        fsPath: "/workspace/test.diff",
        scheme: "file",
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
    } as unknown as jest.Mocked<ViewedStateStore>;

    // Mock message handler
    mockMessageHandler = {
      onMessageReceived: jest.fn(),
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
    mockExtractConfig.mockReturnValue({
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

      expect(disposables).toHaveLength(3);
      expect(mockRegisterCustomEditorProvider).toHaveBeenCalledWith("diffViewer", expect.any(DiffViewerProvider), {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: true,
        },
        supportsMultipleEditorsPerDocument: false,
      });
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.showLineByLine", expect.any(Function));
      expect(mockRegisterCommand).toHaveBeenCalledWith("diffviewer.showSideBySide", expect.any(Function));
    });

    it("should call setOutputFormatConfig when commands are executed", () => {
      DiffViewerProvider.registerContributions({
        extensionContext: mockExtensionContext,
        webviewPath: mockWebviewPath,
      });

      // Get the command functions
      const lineByLineCommand = mockRegisterCommand.mock.calls[0][1];
      const sideBySideCommand = mockRegisterCommand.mock.calls[1][1];

      // Execute commands
      lineByLineCommand();
      sideBySideCommand();

      expect(mockSetOutputFormatConfig).toHaveBeenCalledWith("line-by-line");
      expect(mockSetOutputFormatConfig).toHaveBeenCalledWith("side-by-side");
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

    it("should send ping message and setup webview", async () => {
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "ping",
      });
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
        postMessageToWebviewFn: expect.any(Function),
      });
    });

    it("should register event handlers and update webview", async () => {
      const mockOnDidChangeTextDocument = jest.fn();
      const mockOnDidReceiveMessage = jest.fn();
      const mockOnDidChangeConfiguration = jest.fn();
      const mockOnDidChangeTabs = jest.fn();

      // Setup mocked vscode event listeners
      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = mockOnDidChangeTabs;

      // Setup webview panel mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockWebviewPanel.webview as any).onDidReceiveMessage = mockOnDidReceiveMessage;

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      expect(mockOnDidChangeTextDocument).toHaveBeenCalled();
      expect(mockOnDidReceiveMessage).toHaveBeenCalled();
      expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
      expect(mockOnDidChangeTabs).toHaveBeenCalled();
    });

    it("should handle diff parsing and webview update", async () => {
      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      // Fast-forward timers to execute setTimeout
      jest.runAllTimers();

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
          viewedState: expect.any(Object),
          diffContainer: SkeletonElementIds.DiffContainer,
        },
      });
    });

    it("should dispose panel and show warning for invalid diff content", async () => {
      mockParse.mockReturnValue([]);
      const mockDispose = jest.fn();
      const mockShowWarningMessage = jest.fn();
      const mockExecuteCommand = jest.fn();

      mockWebviewPanel.dispose = mockDispose;
      (vscode.window.showWarningMessage as jest.Mock) = mockShowWarningMessage;
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = jest.fn();
      (vscode.commands.executeCommand as jest.Mock) = mockExecuteCommand;

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      jest.runAllTimers();

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
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = jest.fn();

      await provider.resolveCustomTextEditor(mockTextDocument, mockWebviewPanel, mockCancellationToken);

      jest.runAllTimers();

      expect(mockDispose).not.toHaveBeenCalled();
      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe("resolveCssUris", () => {
    it("should return CSS URIs in correct order for light theme", () => {
      const config = {
        diff2html: {
          colorScheme: ColorSchemeType.LIGHT,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cssUris = (provider as any).resolveCssUris({
        webview: mockWebview,
        config,
      });

      expect(cssUris).toHaveLength(5);
      expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(5);
    });

    it("should return CSS URIs in correct order for dark theme", () => {
      const config = {
        diff2html: {
          colorScheme: ColorSchemeType.DARK,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cssUris = (provider as any).resolveCssUris({
        webview: mockWebview,
        config,
      });

      expect(cssUris).toHaveLength(5);
      expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(5);
    });
  });

  describe("postMessageToWebviewWrapper", () => {
    it("should post message to webview", () => {
      const message: MessageToWebview = {
        kind: "ping",
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

    it("should send prepare message and build skeleton", () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "prepare",
      });
      expect(mockExtractConfig).toHaveBeenCalled();
      expect(mockBuildSkeleton).toHaveBeenCalled();
    });

    it("should handle webview update after timeout", () => {
      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).updateWebview(webviewContext);

      jest.runAllTimers();

      expect(mockTextDocument.getText).toHaveBeenCalled();
      expect(mockParse).toHaveBeenCalled();
      expect(mockViewedStateStore.getViewedState).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        kind: "updateWebview",
        payload: expect.objectContaining({
          config: expect.any(Object),
          diffFiles: expect.any(Array),
          viewedState: expect.any(Object),
          diffContainer: SkeletonElementIds.DiffContainer,
        }),
      });
    });
  });

  describe("registerEventHandlers", () => {
    it("should register text document change handler", () => {
      const mockOnDidChangeTextDocument = jest.fn();
      const mockOnDidReceiveMessage = jest.fn();
      const mockOnDidChangeConfiguration = jest.fn();
      const mockOnDidChangeTabs = jest.fn();

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = mockOnDidChangeTabs;

      const webviewContext = {
        document: mockTextDocument,
        panel: mockWebviewPanel,
        viewedStateStore: mockViewedStateStore,
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
      expect(mockOnDidChangeTabs).toHaveBeenCalled();
    });

    it("should only update webview for matching document", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview");
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
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = jest.fn();

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
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview");
      const mockOnDidChangeTextDocument = jest.fn((callback) => {
        // Simulate document change event for same document
        callback({
          document: mockTextDocument,
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = mockOnDidChangeTextDocument;
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn();
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = jest.fn();

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
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview");
      const mockOnDidChangeConfiguration = jest.fn((callback) => {
        // Simulate configuration change event
        callback({
          affectsConfiguration: jest.fn().mockReturnValue(true),
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn();
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = jest.fn();

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

    it("should not update webview for configuration changes not affecting app config", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpdateWebview = jest.spyOn(provider as any, "updateWebview");
      const mockOnDidChangeConfiguration = jest.fn((callback) => {
        // Simulate configuration change event
        callback({
          affectsConfiguration: jest.fn().mockReturnValue(false),
        });
      });

      (vscode.workspace.onDidChangeTextDocument as jest.Mock) = jest.fn();
      (vscode.workspace.onDidChangeConfiguration as jest.Mock) = mockOnDidChangeConfiguration;
      (vscode.window.tabGroups.onDidChangeTabs as jest.Mock) = jest.fn();

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
