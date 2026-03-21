// Jest setup file for VS Code extension testing
// Mock VS Code modules
jest.mock(
  "vscode",
  () => ({
    window: {
      showWarningMessage: jest.fn(),
    },
    commands: {
      executeCommand: jest.fn(),
    },
    workspace: {
      getWorkspaceFolder: jest.fn(),
      fs: {
        stat: jest.fn(),
      },
      workspaceFolders: [],
    },
    Uri: {
      file: jest.fn(),
      joinPath: jest.fn((base, ...paths: string[]) => ({
        ...base,
        path: [base.path || base.fsPath || "", ...paths].join("/").replaceAll(/\/+/g, "/"),
        fsPath: [base.fsPath || base.path || "", ...paths].join("/").replaceAll(/\/+/g, "/"),
      })),
    },
    Range: jest.fn(),
  }),
  { virtual: true },
);

// Mock the node:path module
jest.mock("node:path", () => ({
  basename: jest.fn((path: string) => path.split("/").pop() || path),
  join: jest.fn((...paths: string[]) => paths.join("/")),
}));
