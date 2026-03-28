import { ColorSchemeType } from "diff2html/lib/types";
import * as vscode from "vscode";
import { extractConfig, isAutoColorScheme } from "../configuration";

jest.mock("vscode", () => ({
  workspace: {
    getConfiguration: jest.fn(),
  },
  window: {
    activeColorTheme: {
      kind: 1,
    },
  },
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  },
}));

describe("configuration", () => {
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: mockGet,
    });
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "colorScheme") {
        return "auto";
      }
      return fallback;
    });
  });

  it("should resolve auto color scheme to dark when VS Code theme is dark", () => {
    Object.defineProperty(vscode.window, "activeColorTheme", {
      value: { kind: vscode.ColorThemeKind.Dark },
      configurable: true,
    });

    const config = extractConfig();

    expect(config.diff2html.colorScheme).toBe(ColorSchemeType.DARK);
  });

  it("should resolve auto color scheme to light when VS Code theme is light", () => {
    Object.defineProperty(vscode.window, "activeColorTheme", {
      value: { kind: vscode.ColorThemeKind.Light },
      configurable: true,
    });

    const config = extractConfig();

    expect(config.diff2html.colorScheme).toBe(ColorSchemeType.LIGHT);
  });

  it("should preserve explicit color scheme values", () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "colorScheme") {
        return ColorSchemeType.DARK;
      }
      return fallback;
    });

    const config = extractConfig();

    expect(config.diff2html.colorScheme).toBe(ColorSchemeType.DARK);
  });

  it("should default the global scrollbar setting to disabled", () => {
    const config = extractConfig();

    expect(config.globalScrollbar).toBe(false);
  });

  it("should preserve an explicit global scrollbar setting", () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "globalScrollbar") {
        return true;
      }
      return fallback;
    });

    const config = extractConfig();

    expect(config.globalScrollbar).toBe(true);
  });

  it("should report when auto color scheme mode is enabled", () => {
    expect(isAutoColorScheme()).toBe(true);
  });

  it("should report when auto color scheme mode is disabled", () => {
    mockGet.mockImplementation((key: string, fallback: unknown) => {
      if (key === "colorScheme") {
        return ColorSchemeType.LIGHT;
      }
      return fallback;
    });

    expect(isAutoColorScheme()).toBe(false);
  });
});
