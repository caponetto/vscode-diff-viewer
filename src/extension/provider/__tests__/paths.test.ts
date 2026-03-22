import * as vscode from "vscode";
import { clearAccessiblePathsCache, collectAccessiblePaths } from "../paths";

jest.mock("vscode", () => ({
  workspace: {
    fs: {
      stat: jest.fn(),
    },
    getWorkspaceFolder: jest.fn(),
    workspaceFolders: [],
  },
  Uri: {
    file: jest.fn((path: string) => ({
      fsPath: path,
      path,
      scheme: "file",
    })),
    joinPath: jest.fn((base, ...paths) => ({
      fsPath: `${base?.fsPath ?? ""}/${paths.join("/")}`.replaceAll(/\/+/g, "/"),
      path: `${base?.path ?? base?.fsPath ?? ""}/${paths.join("/")}`.replaceAll(/\/+/g, "/"),
      scheme: base?.scheme ?? "file",
    })),
  },
}));

describe("provider/paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue({
      uri: { fsPath: "/workspace", path: "/workspace", scheme: "file", with: jest.fn() },
    });
    (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});
  });

  it("collects accessible normalized paths and caches the result", async () => {
    const webviewContext = {
      document: { uri: { fsPath: "/workspace/test.patch", path: "/workspace/test.patch", scheme: "file" } },
    } as never;

    const result = await collectAccessiblePaths({
      webviewContext,
      diffFiles: [
        { oldName: "a/src/file.ts", newName: "b/src/file.ts" },
        { oldName: "/dev/null", newName: "b/src/added.ts" },
      ] as never,
    });

    expect(result).toEqual(["a/src/file.ts", "b/src/file.ts", "b/src/added.ts"]);
    expect((webviewContext as { accessiblePathsCache?: string[] }).accessiblePathsCache).toEqual(result);
  });

  it("clears the accessible path cache", () => {
    const webviewContext = {
      accessiblePathsCacheKey: "key",
      accessiblePathsCache: ["src/file.ts"],
    } as never;

    clearAccessiblePathsCache(webviewContext);

    expect((webviewContext as { accessiblePathsCacheKey?: string }).accessiblePathsCacheKey).toBeUndefined();
    expect((webviewContext as { accessiblePathsCache?: string[] }).accessiblePathsCache).toBeUndefined();
  });
});
