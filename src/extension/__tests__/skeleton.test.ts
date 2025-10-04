import * as vscode from "vscode";
import { buildSkeleton } from "../skeleton";
import { SkeletonElementIds } from "../../shared/css/elements";

// Mock vscode.Uri
jest.mock("vscode", () => ({
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
  },
}));

describe("Skeleton Builder", () => {
  let mockWebviewUri: vscode.Uri;
  let mockCssUris: vscode.Uri[];

  beforeEach(() => {
    mockWebviewUri = { fsPath: "dist/webview.js", toString: () => "dist/webview.js" } as vscode.Uri;
    mockCssUris = [
      { fsPath: "styles/reset.css", toString: () => "styles/reset.css" } as vscode.Uri,
      { fsPath: "styles/app.css", toString: () => "styles/app.css" } as vscode.Uri,
      { fsPath: "styles/highlight.css", toString: () => "styles/highlight.css" } as vscode.Uri,
    ];
  });

  describe("buildSkeleton", () => {
    it("should generate valid HTML structure", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("</html>");
    });

    it("should include all required meta tags", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
      expect(html).toContain('<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">');
    });

    it("should include title tag", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain("<title></title>");
    });

    it("should include all CSS links", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`<link rel="stylesheet" href="styles/reset.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/app.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/highlight.css">`);
    });

    it("should include webview script", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`<script src="dist/webview.js"></script>`);
    });

    it("should include all skeleton element IDs", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`id="${SkeletonElementIds.LoadingContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.EmptyMessageContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.DiffContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.ViewedIndicator}"`);
      expect(html).toContain(`id="${SkeletonElementIds.ViewedProgressContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.ViewedProgress}"`);
      expect(html).toContain(`id="${SkeletonElementIds.MarkAllViewedContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.MarkAllViewedCheckbox}"`);
    });

    it("should include loading container with loading text", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`<div id="${SkeletonElementIds.LoadingContainer}">`);
      expect(html).toContain("<span>Loading...</span>");
    });

    it("should include empty message container with hidden style", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`<div id="${SkeletonElementIds.EmptyMessageContainer}" style="display: none">`);
      expect(html).toContain("<span>Empty diff file</span>");
    });

    it("should include diff container", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`<div id="${SkeletonElementIds.DiffContainer}"></div>`);
    });

    it("should include footer with viewed elements", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain("<footer>");
      expect(html).toContain(`<span id="${SkeletonElementIds.ViewedIndicator}"></span>`);
      expect(html).toContain(`<div id="${SkeletonElementIds.ViewedProgressContainer}">`);
      expect(html).toContain(`<div id="${SkeletonElementIds.ViewedProgress}"></div>`);
      expect(html).toContain("</div>");
    });

    it("should include mark all viewed checkbox", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      expect(html).toContain(`<label id="${SkeletonElementIds.MarkAllViewedContainer}">`);
      expect(html).toContain(
        `<input id="${SkeletonElementIds.MarkAllViewedCheckbox}" type="checkbox" name="mark-all-as-viewed">`,
      );
      expect(html).toContain("Mark all as viewed");
      expect(html).toContain("</input>");
      expect(html).toContain("</label>");
    });

    it("should handle empty CSS URIs array", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: [] });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<script src="dist/webview.js"></script>');
      // Should not contain any CSS links
      expect(html).not.toMatch(/<link rel="stylesheet"/);
    });

    it("should handle single CSS URI", () => {
      const singleCssUri = [{ fsPath: "styles/single.css", toString: () => "styles/single.css" } as vscode.Uri];
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: singleCssUri });

      expect(html).toContain(`<link rel="stylesheet" href="styles/single.css">`);
      expect(html).toContain('<script src="dist/webview.js"></script>');
    });

    it("should handle multiple CSS URIs", () => {
      const multipleCssUris = [
        { fsPath: "styles/reset.css", toString: () => "styles/reset.css" } as vscode.Uri,
        { fsPath: "styles/app.css", toString: () => "styles/app.css" } as vscode.Uri,
        { fsPath: "styles/theme.css", toString: () => "styles/theme.css" } as vscode.Uri,
        { fsPath: "styles/highlight.css", toString: () => "styles/highlight.css" } as vscode.Uri,
      ];
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: multipleCssUris });

      expect(html).toContain(`<link rel="stylesheet" href="styles/reset.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/app.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/theme.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/highlight.css">`);
    });

    it("should generate valid HTML structure with proper nesting", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      // Check that the HTML structure is properly nested
      const headStart = html.indexOf("<head>");
      const headEnd = html.indexOf("</head>");
      const bodyStart = html.indexOf("<body>");
      const bodyEnd = html.indexOf("</body>");

      expect(headStart).toBeLessThan(headEnd);
      expect(headEnd).toBeLessThan(bodyStart);
      expect(bodyStart).toBeLessThan(bodyEnd);
    });

    it("should include all required elements in correct order", () => {
      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: mockCssUris });

      // Check that elements appear in the expected order
      const loadingIndex = html.indexOf(SkeletonElementIds.LoadingContainer);
      const emptyIndex = html.indexOf(SkeletonElementIds.EmptyMessageContainer);
      const diffIndex = html.indexOf(SkeletonElementIds.DiffContainer);
      const footerIndex = html.indexOf("<footer>");

      expect(loadingIndex).toBeLessThan(emptyIndex);
      expect(emptyIndex).toBeLessThan(diffIndex);
      expect(diffIndex).toBeLessThan(footerIndex);
    });

    it("should handle different webview URI formats", () => {
      const differentUris = [
        { fsPath: "dist/webview.js", toString: () => "dist/webview.js" },
        { fsPath: "/absolute/path/webview.js", toString: () => "/absolute/path/webview.js" },
        { fsPath: "relative/path/webview.js", toString: () => "relative/path/webview.js" },
      ];

      differentUris.forEach((uri) => {
        const html = buildSkeleton({ webviewUri: uri as vscode.Uri, cssUris: mockCssUris });
        expect(html).toContain(`<script src="${uri.toString()}"></script>`);
      });
    });

    it("should handle different CSS URI formats", () => {
      const differentCssUris = [
        { fsPath: "styles/reset.css", toString: () => "styles/reset.css" },
        { fsPath: "/absolute/path/app.css", toString: () => "/absolute/path/app.css" },
        { fsPath: "relative/path/theme.css", toString: () => "relative/path/theme.css" },
      ];

      const html = buildSkeleton({ webviewUri: mockWebviewUri, cssUris: differentCssUris as vscode.Uri[] });

      expect(html).toContain(`<link rel="stylesheet" href="styles/reset.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="/absolute/path/app.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="relative/path/theme.css">`);
    });
  });
});
