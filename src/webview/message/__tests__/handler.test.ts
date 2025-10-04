import { ColorSchemeType, DiffFile } from "diff2html/lib/types";
import { Diff2HtmlUI } from "diff2html/lib/ui/js/diff2html-ui-slim.js";
import { MessageToWebviewHandlerImpl } from "../handler";
import { AppConfig } from "../../../extension/configuration";
import { ViewedState } from "../../../extension/viewed-state";
import { getSha1Hash } from "../hash";

// Mock DiffFile with minimal required properties
const createMockDiffFile = (newName: string): DiffFile =>
  ({
    newName,
    oldName: newName,
    addedLines: 0,
    deletedLines: 0,
    isCombined: false,
    isGitDiff: true,
    language: "typescript",
    blocks: [],
  }) as DiffFile;

// Mock the Diff2HtmlUI
jest.mock("diff2html/lib/ui/js/diff2html-ui-slim.js", () => ({
  Diff2HtmlUI: jest.fn().mockImplementation(() => ({
    draw: jest.fn(),
  })),
}));

// Mock the hash function
jest.mock("../hash", () => ({
  getSha1Hash: jest.fn(),
}));

// Mock the extract functions
jest.mock("../../../shared/extract", () => ({
  extractNewFileNameFromDiffName: jest.fn((name: string) => name.replace(/\{\S+ → (\S+)\}/gu, "$1")),
  extractNumberFromString: jest.fn((str: string) => {
    const num = Number.parseInt(str.trim());
    return Number.isNaN(num) ? undefined : num;
  }),
}));

// Mock DOM methods
const mockGetElementById = jest.fn();
const mockQuerySelectorAll = jest.fn();
const mockQuerySelector = jest.fn();
const mockClosest = jest.fn();
const mockMatches = jest.fn();
const mockAddEventListener = jest.fn();
const mockClick = jest.fn();
const mockScrollIntoView = jest.fn();
const mockGetComputedStyle = jest.fn();

// Mock document and window
Object.defineProperty(global, "document", {
  value: {
    getElementById: mockGetElementById,
    querySelectorAll: mockQuerySelectorAll,
    querySelector: mockQuerySelector,
    createElement: jest.fn().mockReturnValue({
      querySelectorAll: mockQuerySelectorAll,
      addEventListener: mockAddEventListener,
    }),
    documentElement: {
      style: {
        setProperty: jest.fn(),
      },
    },
  },
  writable: true,
});

Object.defineProperty(global, "window", {
  value: {
    getComputedStyle: mockGetComputedStyle,
  },
  writable: true,
});

// Mock getComputedStyle globally
Object.defineProperty(global, "getComputedStyle", {
  value: mockGetComputedStyle,
  writable: true,
});

describe("MessageToWebviewHandlerImpl", () => {
  let mockPostMessageToExtensionFn: jest.Mock;
  let handler: MessageToWebviewHandlerImpl;
  let mockConfig: AppConfig;
  let mockViewedState: ViewedState;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock post message function
    mockPostMessageToExtensionFn = jest.fn();

    // Create handler instance
    handler = new MessageToWebviewHandlerImpl(mockPostMessageToExtensionFn);

    // Create mock config
    mockConfig = {
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
    };

    // Create mock viewed state
    mockViewedState = {
      "file1.ts": "hash1",
      "file2.ts": "hash2",
    };

    // Setup default DOM mocks
    const mockElement = {
      style: { display: "none" },
      textContent: "",
      checked: false,
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
      },
      querySelectorAll: mockQuerySelectorAll,
      addEventListener: mockAddEventListener,
    };

    // Mock getElementById to return elements with proper structure
    mockGetElementById.mockImplementation((id: string) => {
      if (id === "mark-all-viewed-checkbox") {
        return {
          addEventListener: mockAddEventListener,
        };
      }
      if (id === "loading-container") {
        return { style: { display: "none" } };
      }
      if (id === "empty-message-container") {
        return { style: { display: "none" } };
      }
      if (id === "viewed-indicator") {
        return { textContent: "" };
      }
      if (id === "viewed-progress") {
        return { style: { width: "" } };
      }
      if (id === "mark-all-viewed-container") {
        return { classList: { add: jest.fn(), remove: jest.fn() } };
      }
      return mockElement;
    });
    mockQuerySelectorAll.mockReturnValue([]);
    mockQuerySelector.mockReturnValue(null);
    mockClosest.mockReturnValue(null);
    mockMatches.mockReturnValue(false);
    mockGetComputedStyle.mockReturnValue({
      getPropertyValue: jest.fn().mockReturnValue("test-value"),
    });
  });

  describe("constructor", () => {
    it("should initialize with postMessageToExtensionFn", () => {
      expect(handler).toBeInstanceOf(MessageToWebviewHandlerImpl);
    });
  });

  describe("prepare", () => {
    it("should show loading and hide empty state", () => {
      const mockLoadingContainer = { style: { display: "none" } };
      const mockEmptyContainer = { style: { display: "block" } };

      mockGetElementById.mockReturnValueOnce(mockLoadingContainer).mockReturnValueOnce(mockEmptyContainer);

      handler.prepare();

      expect(mockGetElementById).toHaveBeenCalledWith("loading-container");
      expect(mockGetElementById).toHaveBeenCalledWith("empty-message-container");
      expect(mockLoadingContainer.style.display).toBe("block");
      expect(mockEmptyContainer.style.display).toBe("none");
    });
  });

  describe("ping", () => {
    it("should send pong message to extension", () => {
      handler.ping();

      expect(mockPostMessageToExtensionFn).toHaveBeenCalledWith({ kind: "pong" });
    });
  });

  describe("updateWebview", () => {
    let mockDiffContainer: HTMLElement;
    let mockDiffFiles: DiffFile[];

    beforeEach(() => {
      mockDiffContainer = {
        querySelectorAll: mockQuerySelectorAll,
        addEventListener: mockAddEventListener,
      } as unknown as HTMLElement;

      mockDiffFiles = [createMockDiffFile("file1.ts"), createMockDiffFile("file2.ts")];

      mockGetElementById.mockReturnValue(mockDiffContainer);
    });

    it("should return early if diff container not found", async () => {
      mockGetElementById.mockReturnValue(null);

      await handler.updateWebview({
        config: mockConfig,
        diffFiles: mockDiffFiles,
        diffContainer: "test-container",
        viewedState: mockViewedState,
      });

      expect(Diff2HtmlUI).not.toHaveBeenCalled();
    });

    it("should show empty state when no diff files", async () => {
      const mockDiffContainer = {
        querySelectorAll: mockQuerySelectorAll,
        addEventListener: mockAddEventListener,
      } as unknown as HTMLElement;

      // Reset the mock to use the global implementation
      mockGetElementById.mockReset();
      mockGetElementById.mockImplementation((id: string) => {
        if (id === "test-container") {
          return mockDiffContainer;
        }
        if (id === "mark-all-viewed-checkbox") {
          return { addEventListener: mockAddEventListener };
        }
        if (id === "loading-container") {
          return { style: { display: "none" } };
        }
        if (id === "empty-message-container") {
          return { style: { display: "none" } };
        }
        if (id === "viewed-indicator") {
          return { textContent: "" };
        }
        if (id === "viewed-progress") {
          return { style: { width: "" } };
        }
        if (id === "mark-all-viewed-container") {
          return { classList: { add: jest.fn(), remove: jest.fn() } };
        }
        return { style: { display: "none" } };
      });

      await handler.updateWebview({
        config: mockConfig,
        diffFiles: [],
        diffContainer: "test-container",
        viewedState: mockViewedState,
      });

      expect(mockGetElementById).toHaveBeenCalledWith("empty-message-container");
    });

    it("should setup theme and create Diff2HtmlUI", async () => {
      const mockRoot = {
        style: { setProperty: jest.fn() },
      };
      Object.defineProperty(global.document, "documentElement", {
        value: mockRoot,
        writable: true,
      });

      // Reset the mock to use the global implementation
      mockGetElementById.mockReset();
      mockGetElementById.mockImplementation((id: string) => {
        if (id === "test-container") {
          return mockDiffContainer;
        }
        if (id === "mark-all-viewed-checkbox") {
          return { addEventListener: mockAddEventListener };
        }
        if (id === "loading-container") {
          return { style: { display: "none" } };
        }
        if (id === "empty-message-container") {
          return { style: { display: "none" } };
        }
        if (id === "viewed-indicator") {
          return { textContent: "" };
        }
        if (id === "viewed-progress") {
          return { style: { width: "" } };
        }
        if (id === "mark-all-viewed-container") {
          return { classList: { add: jest.fn(), remove: jest.fn() } };
        }
        return { style: { display: "none" } };
      });

      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: jest.fn().mockReturnValue("test-value"),
      });

      await handler.updateWebview({
        config: mockConfig,
        diffFiles: mockDiffFiles,
        diffContainer: "test-container",
        viewedState: mockViewedState,
      });

      expect(Diff2HtmlUI).toHaveBeenCalledWith(mockDiffContainer, mockDiffFiles, mockConfig.diff2html);
    });
  });

  describe("setupTheme", () => {
    it("should set CSS properties based on theme", () => {
      const mockRoot = {
        style: { setProperty: jest.fn() },
      };
      Object.defineProperty(global.document, "documentElement", {
        value: mockRoot,
        writable: true,
      });

      mockGetComputedStyle.mockReturnValue({
        getPropertyValue: jest.fn().mockReturnValue("test-value"),
      });

      // Access private method through type assertion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).setupTheme("dark");

      expect(mockGetComputedStyle).toHaveBeenCalledWith(mockRoot);
      expect(mockRoot.style.setProperty).toHaveBeenCalled();
    });
  });

  describe("viewed toggle handlers", () => {
    let mockViewedToggle: HTMLInputElement;

    beforeEach(() => {
      mockViewedToggle = {
        classList: { remove: jest.fn() },
        scrollIntoView: mockScrollIntoView,
        checked: true,
        closest: mockClosest,
      } as unknown as HTMLInputElement;

      mockClosest.mockReturnValue({
        scrollIntoView: mockScrollIntoView,
        querySelector: mockQuerySelector,
      });
    });

    it("should handle viewed toggle change", () => {
      const mockEvent = { target: mockViewedToggle } as unknown as Event;

      // Mock the querySelector to return a file name element
      mockQuerySelector.mockReturnValue({ textContent: "test.ts" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).onViewedToggleChangedHandler(mockEvent);

      expect(mockViewedToggle.classList.remove).toHaveBeenCalledWith("changed-since-last-view");
      expect(mockScrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });

    it("should handle mark all viewed change", () => {
      const mockMarkAllCheckbox = {
        checked: true,
        addEventListener: mockAddEventListener,
      } as unknown as HTMLInputElement;

      const mockToggles = [
        { checked: false, click: mockClick },
        { checked: false, click: mockClick },
      ];

      mockGetElementById.mockReturnValue(mockMarkAllCheckbox);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getViewedToggles = jest.fn().mockReturnValue(mockToggles);

      const mockEvent = { target: mockMarkAllCheckbox } as unknown as Event;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).onMarkAllViewedChangedHandler(mockEvent);

      expect(mockToggles[0].click).toHaveBeenCalled();
      expect(mockToggles[1].click).toHaveBeenCalled();
    });
  });

  describe("footer updates", () => {
    it("should update footer with viewed count", () => {
      const mockIndicator = { textContent: "" };
      const mockProgressBar = { style: { width: "" } };
      const mockCheckbox = { checked: false };
      const mockContainer = { classList: { add: jest.fn(), remove: jest.fn() } };

      mockGetElementById
        .mockReturnValueOnce(mockIndicator)
        .mockReturnValueOnce(mockProgressBar)
        .mockReturnValueOnce(mockCheckbox)
        .mockReturnValueOnce(mockContainer);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getViewedToggles = jest.fn().mockReturnValue([{}, {}, {}]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getViewedCount = jest.fn().mockReturnValue(2);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).updateFooter();

      expect(mockIndicator.textContent).toBe("2 / 3 files viewed");
      expect(mockProgressBar.style.width).toBe("67%");
      expect(mockCheckbox.checked).toBe(false);
    });

    it("should return early if indicator not found", () => {
      mockGetElementById.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).updateFooter();

      expect(mockGetElementById).toHaveBeenCalledWith("viewed-indicator");
    });
  });

  describe("diff interaction", () => {
    let mockDiffElement: HTMLElement;

    beforeEach(() => {
      mockDiffElement = {
        closest: mockClosest,
        querySelector: mockQuerySelector,
        textContent: "test.ts",
      } as unknown as HTMLElement;
    });

    it("should handle diff click and open file", () => {
      const mockEvent = { target: mockDiffElement } as unknown as Event;
      const mockFileContainer = { querySelector: mockQuerySelector };
      const mockFileNameLink = { textContent: "test.ts" };

      mockClosest.mockReturnValue(mockFileContainer);
      mockQuerySelector.mockReturnValue(mockFileNameLink);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getClickedLineNumber = jest.fn().mockReturnValue(5);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).onDiffClickedHandler(mockEvent);

      expect(mockPostMessageToExtensionFn).toHaveBeenCalledWith({
        kind: "openFile",
        payload: {
          path: "test.ts",
          line: 5,
        },
      });
    });

    it("should ignore clicks when no line number and not file name link", () => {
      const mockEvent = { target: mockDiffElement } as unknown as Event;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getClickedLineNumber = jest.fn().mockReturnValue(undefined);
      mockClosest.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).onDiffClickedHandler(mockEvent);

      expect(mockPostMessageToExtensionFn).not.toHaveBeenCalled();
    });
  });

  describe("line number extraction", () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).currentConfig = mockConfig;
    });

    it("should extract line number for line-by-line format", () => {
      mockConfig.diff2html.outputFormat = "line-by-line";

      const mockLineElement = {
        closest: mockClosest,
        querySelector: mockQuerySelector,
        matches: mockMatches,
      };

      mockClosest.mockReturnValue(mockLineElement);
      mockQuerySelector.mockReturnValue({ textContent: "42" });
      mockMatches.mockReturnValue(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (handler as any).getClickedLineNumberOnLineByLine(mockLineElement as unknown as HTMLElement);

      expect(result).toBe(42);
    });

    it("should extract line number for side-by-side format", () => {
      mockConfig.diff2html.outputFormat = "side-by-side";

      const mockLineNumberElement = {
        textContent: "42",
        closest: mockClosest,
      };

      const mockLineElement = {
        closest: mockClosest,
      };

      // Mock the closest method to return the line number element
      mockClosest.mockImplementation((selector: string) => {
        if (selector === ".d2h-code-side-linenumber") {
          return mockLineNumberElement;
        }
        return null;
      });

      // Mock the extractNumberFromString function
      const { extractNumberFromString } = require("../../../shared/extract");
      (extractNumberFromString as jest.Mock).mockReturnValue(42);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (handler as any).getClickedLineNumberOnSideBySide(mockLineElement as unknown as HTMLElement);

      expect(extractNumberFromString).toHaveBeenCalledWith("42");
      expect(result).toBe(42);
    });

    it("should return undefined for deleted lines", () => {
      mockConfig.diff2html.outputFormat = "line-by-line";

      const mockLineElement = {
        closest: mockClosest,
        querySelector: mockQuerySelector,
        matches: mockMatches,
      };

      mockClosest.mockReturnValue(mockLineElement);
      mockMatches.mockReturnValue(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (handler as any).getClickedLineNumberOnLineByLine(mockLineElement as unknown as HTMLElement);

      expect(result).toBeUndefined();
    });
  });

  describe("viewed state management", () => {
    it("should hide viewed files based on state", async () => {
      const mockToggle = {
        click: mockClick,
        classList: { add: jest.fn() },
        closest: mockClosest,
      };

      const mockFileContainer = {
        querySelector: mockQuerySelector,
      };

      const mockDiffContainer = {
        querySelectorAll: jest.fn().mockReturnValue([mockToggle]),
      } as unknown as HTMLElement;

      mockClosest.mockReturnValue(mockFileContainer);
      mockQuerySelector.mockReturnValue({ textContent: "file1.ts" });
      (getSha1Hash as jest.Mock).mockResolvedValue("hash1");

      // Mock the getDiffElementFileName method to return the correct file name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffElementFileName = jest.fn().mockReturnValue("file1.ts");

      // Mock the getDiffHash method to return the correct hash
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffHash = jest.fn().mockResolvedValue("hash1");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (handler as any).hideViewedFiles(mockDiffContainer, mockViewedState);

      expect(mockToggle.click).toHaveBeenCalled();
    });

    it("should mark files as changed since viewed", async () => {
      const mockToggle = {
        click: mockClick,
        classList: { add: jest.fn() },
        closest: mockClosest,
      };

      const mockFileContainer = {
        querySelector: mockQuerySelector,
      };

      const mockDiffContainer = {
        querySelectorAll: jest.fn().mockReturnValue([mockToggle]),
      } as unknown as HTMLElement;

      mockClosest.mockReturnValue(mockFileContainer);
      mockQuerySelector.mockReturnValue({ textContent: "file1.ts" });
      (getSha1Hash as jest.Mock).mockResolvedValue("different-hash");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffElementFileName = jest.fn().mockReturnValue("file1.ts");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (handler as any).hideViewedFiles(mockDiffContainer, mockViewedState);

      expect(mockToggle.click).not.toHaveBeenCalled();
      expect(mockToggle.classList.add).toHaveBeenCalledWith("changed-since-last-view");
    });
  });

  describe("file viewed message sending", () => {
    it("should send file viewed message with hash", async () => {
      const mockToggle = {
        checked: true,
        closest: mockClosest,
      };

      const mockFileContainer = {
        querySelector: mockQuerySelector,
      };

      mockClosest.mockReturnValue(mockFileContainer);
      mockQuerySelector.mockReturnValue({ textContent: "test.ts" });
      (getSha1Hash as jest.Mock).mockResolvedValue("test-hash");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffElementFileName = jest.fn().mockReturnValue("test.ts");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffHash = jest.fn().mockResolvedValue("test-hash");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (handler as any).sendFileViewedMessage(mockToggle as unknown as HTMLInputElement);

      expect(mockPostMessageToExtensionFn).toHaveBeenCalledWith({
        kind: "toggleFileViewed",
        payload: {
          path: "test.ts",
          viewedSha1: "test-hash",
        },
      });
    });

    it("should send file viewed message with null hash when unchecked", async () => {
      const mockToggle = {
        checked: false,
        closest: mockClosest,
      };

      const mockFileContainer = {
        querySelector: mockQuerySelector,
      };

      mockClosest.mockReturnValue(mockFileContainer);
      mockQuerySelector.mockReturnValue({ textContent: "test.ts" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffElementFileName = jest.fn().mockReturnValue("test.ts");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (handler as any).sendFileViewedMessage(mockToggle as unknown as HTMLInputElement);

      expect(mockPostMessageToExtensionFn).toHaveBeenCalledWith({
        kind: "toggleFileViewed",
        payload: {
          path: "test.ts",
          viewedSha1: null,
        },
      });
    });
  });

  describe("UI state management", () => {
    it("should show/hide loading state", () => {
      const mockLoadingContainer = { style: { display: "none" } };
      mockGetElementById.mockReturnValue(mockLoadingContainer);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).showLoading(true);
      expect(mockLoadingContainer.style.display).toBe("block");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).showLoading(false);
      expect(mockLoadingContainer.style.display).toBe("none");
    });

    it("should show/hide empty state", () => {
      const mockEmptyContainer = { style: { display: "none" } };
      mockGetElementById.mockReturnValue(mockEmptyContainer);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).showEmpty(true);
      expect(mockEmptyContainer.style.display).toBe("block");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).showEmpty(false);
      expect(mockEmptyContainer.style.display).toBe("none");
    });

    it("should return early if loading container not found", () => {
      mockGetElementById.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (handler as any).showLoading(true)).not.toThrow();
    });

    it("should return early if empty container not found", () => {
      mockGetElementById.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (handler as any).showEmpty(true)).not.toThrow();
    });
  });

  describe("withLoading", () => {
    it("should show loading, run function, then hide loading", async () => {
      const mockRunnable = jest.fn().mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const showLoadingSpy = jest.spyOn(handler as any, "showLoading");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const showEmptySpy = jest.spyOn(handler as any, "showEmpty");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (handler as any).withLoading(mockRunnable);

      expect(showLoadingSpy).toHaveBeenCalledWith(true);
      expect(showEmptySpy).toHaveBeenCalledWith(false);
      expect(mockRunnable).toHaveBeenCalled();
      expect(showLoadingSpy).toHaveBeenCalledWith(false);
    });
  });

  describe("error handling", () => {
    it("should handle missing elements gracefully", () => {
      mockGetElementById.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (handler as any).showLoading(true)).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (handler as any).showEmpty(true)).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (handler as any).updateFooter()).not.toThrow();
    });

    it("should handle missing file names gracefully", () => {
      const mockToggle = {
        closest: mockClosest,
      };

      mockClosest.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (handler as any).getDiffElementFileName(mockToggle as unknown as HTMLElement);

      expect(result).toBeUndefined();
    });

    it("should handle missing line numbers gracefully", () => {
      const mockElement = {
        closest: mockClosest,
        querySelector: mockQuerySelector,
      };

      mockClosest.mockReturnValue(null);
      mockQuerySelector.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (handler as any).getClickedLineNumberOnLineByLine(mockElement as unknown as HTMLElement);

      expect(result).toBeUndefined();
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete updateWebview workflow", async () => {
      const mockDiffContainer = {
        querySelectorAll: mockQuerySelectorAll,
        addEventListener: mockAddEventListener,
      } as unknown as HTMLElement;

      const mockViewedToggles = [
        {
          addEventListener: mockAddEventListener,
          click: mockClick,
          classList: { add: jest.fn() },
          closest: mockClosest,
        },
      ];

      const mockLoadingContainer = { style: { display: "none" } };
      const mockEmptyContainer = { style: { display: "none" } };

      mockGetElementById
        .mockReturnValueOnce(mockDiffContainer) // For diff container
        .mockReturnValueOnce(mockLoadingContainer) // For loading container
        .mockReturnValueOnce(mockEmptyContainer); // For empty container

      mockQuerySelectorAll.mockReturnValue(mockViewedToggles);
      (getSha1Hash as jest.Mock).mockResolvedValue("test-hash");

      await handler.updateWebview({
        config: mockConfig,
        diffFiles: [createMockDiffFile("test.ts")],
        diffContainer: "test-container",
        viewedState: mockViewedState,
      });

      expect(Diff2HtmlUI).toHaveBeenCalled();
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    it("should handle complete file opening workflow", () => {
      const mockDiffElement = {
        closest: mockClosest,
        querySelector: mockQuerySelector,
      };

      const mockFileContainer = {
        querySelector: mockQuerySelector,
      };

      const mockFileNameLink = { textContent: "test.ts" };
      const mockLineElement = {
        closest: mockClosest,
        querySelector: mockQuerySelector,
        matches: mockMatches,
      };

      mockClosest.mockReturnValueOnce(mockFileContainer).mockReturnValueOnce(mockLineElement);
      mockQuerySelector.mockReturnValueOnce(mockFileNameLink).mockReturnValueOnce({ textContent: "42" });
      mockMatches.mockReturnValue(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).currentConfig = mockConfig;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getDiffElementFileName = jest.fn().mockReturnValue("test.ts");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).getClickedLineNumber = jest.fn().mockReturnValue(42);

      // Mock the extractNumberFromString function
      const { extractNumberFromString } = require("../../../shared/extract");
      (extractNumberFromString as jest.Mock).mockReturnValue(42);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any).maybeOpenFile(mockDiffElement as unknown as HTMLElement);

      expect(mockPostMessageToExtensionFn).toHaveBeenCalledWith({
        kind: "openFile",
        payload: {
          path: "test.ts",
          line: 42,
        },
      });
    });
  });
});
