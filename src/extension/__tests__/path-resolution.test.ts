import * as vscode from "vscode";
import { resolveAccessibleUri } from "../path-resolution";

describe("resolveAccessibleUri", () => {
  let diffDocument: vscode.TextDocument;

  beforeEach(() => {
    jest.clearAllMocks();

    diffDocument = {
      uri: {
        fsPath: "/workspace/test.diff",
        path: "/workspace/test.diff",
        scheme: "file",
        with: jest.fn(({ scheme, path }) => ({
          fsPath: path ?? "/workspace/test.diff",
          path: path ?? "/workspace/test.diff",
          scheme: scheme ?? "file",
        })),
      },
    } as unknown as vscode.TextDocument;

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [],
      writable: true,
    });

    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(undefined);
    (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error("not found"));
  });

  it("returns an absolute file uri when the absolute path exists", async () => {
    const absoluteUri = {
      fsPath: "/absolute/path/file.ts",
      path: "/absolute/path/file.ts",
      scheme: "file",
    };
    (vscode.Uri.file as jest.Mock).mockReturnValue(absoluteUri);
    (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});

    const resolvedUri = await resolveAccessibleUri({
      diffDocument,
      path: "/absolute/path/file.ts",
    });

    expect(vscode.Uri.file).toHaveBeenCalledWith("/absolute/path/file.ts");
    expect(resolvedUri).toBe(absoluteUri);
  });

  it("returns a workspace uri when a relative path exists in the workspace", async () => {
    const workspaceFolder = {
      uri: {
        fsPath: "/workspace",
        path: "/workspace",
        scheme: "file",
        with: jest.fn(),
      },
    } as unknown as vscode.WorkspaceFolder;
    const workspaceUri = {
      fsPath: "/workspace/src/file.ts",
      path: "/workspace/src/file.ts",
      scheme: "file",
    };

    (vscode.workspace.getWorkspaceFolder as jest.Mock).mockReturnValue(workspaceFolder);
    (vscode.Uri.joinPath as jest.Mock).mockReturnValue(workspaceUri);
    (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});

    const resolvedUri = await resolveAccessibleUri({
      diffDocument,
      path: "src/file.ts",
    });

    expect(vscode.Uri.joinPath).toHaveBeenCalledWith(workspaceFolder.uri, "src", "file.ts");
    expect(resolvedUri).toBe(workspaceUri);
  });

  it("falls back to a matching virtual workspace scheme when needed", async () => {
    const virtualWorkspaceFolder = {
      uri: {
        fsPath: "/workspace",
        path: "/workspace",
        scheme: "vscode-vfs",
        with: jest.fn(),
      },
    } as unknown as vscode.WorkspaceFolder;
    const virtualDiffUri = {
      fsPath: "/workspace/test.diff",
      path: "/workspace/test.diff",
      scheme: "vscode-vfs",
    };
    const workspaceUri = {
      fsPath: "/workspace/src/file.ts",
      path: "/workspace/src/file.ts",
      scheme: "vscode-vfs",
    };

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [virtualWorkspaceFolder],
      writable: true,
    });

    (diffDocument.uri.with as jest.Mock).mockReturnValue(virtualDiffUri);
    (vscode.workspace.getWorkspaceFolder as jest.Mock)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(virtualWorkspaceFolder);
    (vscode.Uri.joinPath as jest.Mock).mockReturnValue(workspaceUri);
    (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});

    const resolvedUri = await resolveAccessibleUri({
      diffDocument,
      path: "src/file.ts",
    });

    expect(diffDocument.uri.with).toHaveBeenCalledWith({ scheme: "vscode-vfs" });
    expect(resolvedUri).toBe(workspaceUri);
  });

  it("returns undefined when the path cannot be resolved or accessed", async () => {
    const resolvedUri = await resolveAccessibleUri({
      diffDocument,
      path: "src/missing.ts",
    });

    expect(resolvedUri).toBeUndefined();
  });

  it("returns a workspace uri for root-relative paths that exist in the workspace scheme", async () => {
    const workspaceFolder = {
      uri: {
        fsPath: "/workspace",
        path: "/workspace",
        scheme: "vscode-vfs",
        with: jest.fn(({ path }) => ({
          fsPath: path,
          path,
          scheme: "vscode-vfs",
        })),
      },
    } as unknown as vscode.WorkspaceFolder;
    const absoluteWorkspaceUri = {
      fsPath: "/src/file.ts",
      path: "/src/file.ts",
      scheme: "vscode-vfs",
    };

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [workspaceFolder],
      writable: true,
    });

    (diffDocument.uri.with as jest.Mock).mockReturnValue({
      fsPath: "/workspace/test.diff",
      path: "/workspace/test.diff",
      scheme: "vscode-vfs",
    });
    (vscode.Uri.file as jest.Mock).mockReturnValue({
      fsPath: "/src/file.ts",
      path: "/src/file.ts",
      scheme: "file",
    });
    (vscode.workspace.getWorkspaceFolder as jest.Mock)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(workspaceFolder);
    (vscode.workspace.fs.stat as jest.Mock).mockRejectedValueOnce(new Error("not found")).mockResolvedValue({});

    const resolvedUri = await resolveAccessibleUri({
      diffDocument,
      path: "/src/file.ts",
    });

    expect(workspaceFolder.uri.with).toHaveBeenCalledWith({ path: "/src/file.ts" });
    expect(resolvedUri).toEqual(absoluteWorkspaceUri);
  });
});
