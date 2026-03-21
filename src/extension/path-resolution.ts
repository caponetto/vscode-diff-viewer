import * as vscode from "vscode";

export async function resolveAccessibleUri(args: {
  diffDocument: vscode.TextDocument;
  path: string;
}): Promise<vscode.Uri | undefined> {
  return (
    (await getUriFromAbsolutePathIfExists(args.path)) ||
    (await getUriFromPathInWorkspaceIfExists({
      diffDocument: args.diffDocument,
      path: args.path,
    }))
  );
}

function findDiffFileWorkspace(diffDocument: vscode.TextDocument): vscode.WorkspaceFolder | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(diffDocument.uri);
  if (folder) {
    return folder;
  }

  const workspaceSchemes = new Set(
    vscode.workspace.workspaceFolders?.map((workspaceFolder) => workspaceFolder.uri.scheme),
  );
  for (const scheme of workspaceSchemes) {
    const workspaceSchemeDiffDocumentUri = diffDocument.uri.with({ scheme });
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceSchemeDiffDocumentUri);
    if (workspaceFolder) {
      return workspaceFolder;
    }
  }
}

async function getUriFromPathInWorkspaceIfExists(args: {
  diffDocument: vscode.TextDocument;
  path: string;
}): Promise<vscode.Uri | undefined> {
  const workspaceFolder = findDiffFileWorkspace(args.diffDocument);
  if (!workspaceFolder) {
    return;
  }

  const normalizedPath = args.path.replaceAll("\\", "/");
  if (normalizedPath.startsWith("/")) {
    const absoluteUri = workspaceFolder.uri.with({ path: normalizedPath });
    if (await exists(absoluteUri)) {
      return absoluteUri;
    }
  }

  const relativePath = normalizedPath.replaceAll(/^\/+/g, "");
  const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split("/").filter(Boolean));
  return (await exists(uri)) ? uri : undefined;
}

async function getUriFromAbsolutePathIfExists(path: string): Promise<vscode.Uri | undefined> {
  if (!isAbsolutePath(path)) {
    return;
  }

  const uri = vscode.Uri.file(path);
  return (await exists(uri)) ? uri : undefined;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function isAbsolutePath(path: string): boolean {
  return /^(?:\/|[a-zA-Z]:[\\/])/.test(path);
}
