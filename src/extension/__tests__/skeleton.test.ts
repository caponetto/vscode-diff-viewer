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
  let mockCommonCssUris: vscode.Uri[];
  let mockLightHighlightCssUri: vscode.Uri;
  let mockDarkHighlightCssUri: vscode.Uri;
  const cspSource = "vscode-webview-resource:";
  const nonce = "test-nonce";

  const buildTestSkeleton = (overrides: Partial<Parameters<typeof buildSkeleton>[0]> = {}) =>
    buildSkeleton({
      webviewUri: mockWebviewUri,
      commonCssUris: mockCommonCssUris,
      lightHighlightCssUri: mockLightHighlightCssUri,
      darkHighlightCssUri: mockDarkHighlightCssUri,
      cspSource,
      nonce,
      shellGeneration: 3,
      ...overrides,
    });

  beforeEach(() => {
    mockWebviewUri = { fsPath: "dist/webview.js", toString: () => "dist/webview.js" } as vscode.Uri;
    mockCommonCssUris = [
      { fsPath: "styles/reset.css", toString: () => "styles/reset.css" } as vscode.Uri,
      { fsPath: "styles/app.css", toString: () => "styles/app.css" } as vscode.Uri,
    ];
    mockLightHighlightCssUri = {
      fsPath: "styles/highlight-light.css",
      toString: () => "styles/highlight-light.css",
    } as vscode.Uri;
    mockDarkHighlightCssUri = {
      fsPath: "styles/highlight-dark.css",
      toString: () => "styles/highlight-dark.css",
    } as vscode.Uri;
  });

  describe("buildSkeleton", () => {
    it("should generate valid HTML structure", () => {
      const html = buildTestSkeleton();

      expect(html).toContain("<!doctype html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<body data-shell-generation="3">');
      expect(html).toContain("</html>");
    });

    it("should include all required meta tags", () => {
      const html = buildTestSkeleton();

      expect(html).toContain('<meta charset="UTF-8" />');
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
      expect(html).toContain('<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />');
    });

    it("should include title tag", () => {
      const html = buildTestSkeleton();

      expect(html).toContain("<title></title>");
    });

    it("should include all CSS links", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`<link rel="stylesheet" href="styles/reset.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/app.css">`);
      expect(html).toContain(`id="${SkeletonElementIds.HighlightLightStylesheet}"`);
      expect(html).toContain(`href="styles/highlight-light.css"`);
      expect(html).toContain(`id="${SkeletonElementIds.HighlightDarkStylesheet}"`);
      expect(html).toContain(`href="styles/highlight-dark.css"`);
    });

    it("should include webview script", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`<script nonce="${nonce}" src="dist/webview.js"></script>`);
    });

    it("should include all skeleton element IDs", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`id="${SkeletonElementIds.LoadingContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.EmptyMessageContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.LargeDiffNoticeContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.DiffContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.HorizontalScrollbarContainer}"`);
      expect(html).toContain(`id="${SkeletonElementIds.HorizontalScrollbarContent}"`);
      expect(html).toContain(`id="${SkeletonElementIds.FooterStatus}"`);
      expect(html).toContain(`id="${SkeletonElementIds.ViewedIndicator}"`);
      expect(html).toContain(`id="${SkeletonElementIds.ViewedProgressContainer}"`);
    });

    it("should include loading container with loading text", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`<div id="${SkeletonElementIds.LoadingContainer}">`);
      expect(html).toContain("<span>Loading...</span>");
    });

    it("should include empty message container with hidden style", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`<div id="${SkeletonElementIds.EmptyMessageContainer}" style="display: none">`);
      expect(html).toContain("<span>Empty diff file</span>");
    });

    it("should include diff container", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`<div id="${SkeletonElementIds.DiffContainer}"></div>`);
    });

    it("should include the large diff notice container", () => {
      const html = buildTestSkeleton();

      expect(html).toContain(`<div id="${SkeletonElementIds.LargeDiffNoticeContainer}" style="display: none">`);
      expect(html).toContain(`<span id="${SkeletonElementIds.LargeDiffNoticeMessage}"></span>`);
      expect(html).toContain(
        `<button id="${SkeletonElementIds.LargeDiffNoticeDismiss}" type="button" aria-label="Dismiss large diff notice">Close</button>`,
      );
    });

    it("should include footer with viewed elements", () => {
      const html = buildTestSkeleton();

      expect(html).toContain("<footer>");
      const footerStatusIndex = html.indexOf(`id="${SkeletonElementIds.FooterStatus}"`);
      const horizontalScrollbarIndex = html.indexOf(`id="${SkeletonElementIds.HorizontalScrollbarContainer}"`);
      expect(footerStatusIndex).toBeLessThan(horizontalScrollbarIndex);
      expect(html).toContain(`<div id="${SkeletonElementIds.FooterStatus}">`);
      expect(html).toContain(`<span id="${SkeletonElementIds.ViewedIndicator}" aria-live="polite"></span>`);
      expect(html).toContain(`<progress id="${SkeletonElementIds.ViewedProgressContainer}"`);
      expect(html).toContain(
        `<div id="${SkeletonElementIds.HorizontalScrollbarContainer}" aria-label="Horizontal diff scrollbar" style="display: none">`,
      );
      expect(html).toContain(`<div id="${SkeletonElementIds.HorizontalScrollbarContent}"></div>`);
      expect(html).toContain('aria-label="Viewed files progress"');
      expect(html).toContain('max="100"');
      expect(html).toContain('value="0"');
      expect(html).toContain("</progress>");
    });

    it("should not include footer review action buttons", () => {
      const html = buildTestSkeleton();

      expect(html).not.toContain("Expand all");
      expect(html).not.toContain("Collapse all");
      expect(html).not.toContain("review-actions-container");
    });

    it("should handle empty CSS URIs array", () => {
      const html = buildTestSkeleton({ commonCssUris: [] });

      expect(html).toContain("<!doctype html>");
      expect(html).toContain(`<script nonce="${nonce}" src="dist/webview.js"></script>`);
      expect(html).toContain(`id="${SkeletonElementIds.HighlightLightStylesheet}"`);
      expect(html).toContain(`id="${SkeletonElementIds.HighlightDarkStylesheet}"`);
    });

    it("should handle single CSS URI", () => {
      const singleCssUri = [{ fsPath: "styles/single.css", toString: () => "styles/single.css" } as vscode.Uri];
      const html = buildTestSkeleton({ commonCssUris: singleCssUri });

      expect(html).toContain(`<link rel="stylesheet" href="styles/single.css">`);
      expect(html).toContain(`<script nonce="${nonce}" src="dist/webview.js"></script>`);
    });

    it("should handle multiple CSS URIs", () => {
      const multipleCssUris = [
        { fsPath: "styles/reset.css", toString: () => "styles/reset.css" } as vscode.Uri,
        { fsPath: "styles/app.css", toString: () => "styles/app.css" } as vscode.Uri,
        { fsPath: "styles/theme.css", toString: () => "styles/theme.css" } as vscode.Uri,
      ];
      const html = buildTestSkeleton({ commonCssUris: multipleCssUris });

      expect(html).toContain(`<link rel="stylesheet" href="styles/reset.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/app.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="styles/theme.css">`);
    });

    it("should generate valid HTML structure with proper nesting", () => {
      const html = buildTestSkeleton();

      // Check that the HTML structure is properly nested
      const headStart = html.indexOf("<head>");
      const headEnd = html.indexOf("</head>");
      const bodyStart = html.indexOf("<body ");
      const bodyEnd = html.indexOf("</body>");

      expect(headStart).toBeLessThan(headEnd);
      expect(headEnd).toBeLessThan(bodyStart);
      expect(bodyStart).toBeLessThan(bodyEnd);
    });

    it("should include all required elements in correct order", () => {
      const html = buildTestSkeleton();

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
        const html = buildTestSkeleton({ webviewUri: uri as vscode.Uri });
        expect(html).toContain(`<script nonce="${nonce}" src="${uri.toString()}"></script>`);
      });
    });

    it("should handle different CSS URI formats", () => {
      const differentCssUris = [
        { fsPath: "styles/reset.css", toString: () => "styles/reset.css" },
        { fsPath: "/absolute/path/app.css", toString: () => "/absolute/path/app.css" },
        { fsPath: "relative/path/theme.css", toString: () => "relative/path/theme.css" },
      ];

      const html = buildTestSkeleton({ commonCssUris: differentCssUris as vscode.Uri[] });

      expect(html).toContain(`<link rel="stylesheet" href="styles/reset.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="/absolute/path/app.css">`);
      expect(html).toContain(`<link rel="stylesheet" href="relative/path/theme.css">`);
    });

    it("should include content security policy meta tag", () => {
      const html = buildTestSkeleton();

      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain(`img-src ${cspSource} https: data:;`);
      expect(html).toContain(`script-src 'nonce-${nonce}'`);
    });
  });
});
