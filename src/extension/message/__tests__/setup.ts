// Jest setup file for VS Code extension testing
// Mock VS Code modules
jest.mock("vscode", () => ({
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
  },
  Range: jest.fn(),
}));

// Mock the path module
jest.mock("path", () => ({
  basename: jest.fn((path: string) => path.split("/").pop() || path),
  join: jest.fn((...paths: string[]) => paths.join("/")),
}));
