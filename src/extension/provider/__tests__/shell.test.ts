import { buildSkeleton } from "../../skeleton";
import { ensureWebviewShell, resolveCssUris } from "../shell";

jest.mock("vscode", () => ({
  Uri: {
    joinPath: jest.fn((base, ...paths) => ({
      fsPath: `${base?.fsPath ?? ""}/${paths.join("/")}`.replaceAll(/\/+/g, "/"),
      path: `${base?.path ?? base?.fsPath ?? ""}/${paths.join("/")}`.replaceAll(/\/+/g, "/"),
    })),
  },
}));

jest.mock("../../skeleton", () => ({
  buildSkeleton: jest.fn().mockReturnValue("<html>shell</html>"),
}));

describe("provider/shell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves css URIs and highlight styles", () => {
    const webview = {
      asWebviewUri: jest.fn((uri) => uri),
    } as never;

    const cssUris = resolveCssUris({
      providerArgs: {
        extensionContext: { extensionUri: { fsPath: "/extension", path: "/extension" } } as never,
        webviewPath: "dist/webview.js",
      },
      webview,
    });

    expect(cssUris.commonCssUris).toHaveLength(4);
    expect(cssUris.lightHighlightCssUri).toBeDefined();
    expect(cssUris.darkHighlightCssUri).toBeDefined();
  });

  it("initializes the shell only once", () => {
    const webviewContext = {
      shellInitialized: false,
      panel: {
        webview: {
          cspSource: "vscode-webview:",
          html: "",
          asWebviewUri: jest.fn((uri) => uri),
        },
      },
    } as never;

    const providerArgs = {
      extensionContext: { extensionUri: { fsPath: "/extension", path: "/extension" } } as never,
      webviewPath: "dist/webview.js",
    };

    ensureWebviewShell({ providerArgs, webviewContext });
    ensureWebviewShell({ providerArgs, webviewContext });

    expect(buildSkeleton).toHaveBeenCalledTimes(1);
    expect((webviewContext as { shellInitialized: boolean }).shellInitialized).toBe(true);
  });
});
