import { Diff2HtmlConfig } from "diff2html";
import { ColorSchemeType, LineMatchingType, OutputFormatType } from "diff2html/lib/types";
import * as vscode from "vscode";

export const APP_CONFIG_SECTION = "diffviewer";

const requiredConfigSections = {
  drawFileList: "drawFileList",
  outputFormat: "outputFormat",
  matching: "matching",
  matchWordsThreshold: "matchWordsThreshold",
  matchingMaxComparisons: "matchingMaxComparisons",
  maxLineSizeInBlockForComparison: "maxLineSizeInBlockForComparison",
  maxLineLengthHighlight: "maxLineLengthHighlight",
  renderNothingWhenEmpty: "renderNothingWhenEmpty",
  colorScheme: "colorScheme",
} as const;
const appConfigSections = {
  globalScrollbar: "globalScrollbar",
} as const;

type RequiredConfigIds = (typeof requiredConfigSections)[keyof typeof requiredConfigSections];

export type RequiredDiff2HtmlConfig = Required<Pick<Diff2HtmlConfig, RequiredConfigIds>>;
export type ColorSchemeSetting = ColorSchemeType | "auto";

export type AppConfig = {
  diff2html: RequiredDiff2HtmlConfig;
  globalScrollbar: boolean;
};

const DEFAULT_CONFIG: AppConfig = {
  globalScrollbar: false,
  diff2html: {
    outputFormat: "line-by-line",
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

export function extractConfig(): AppConfig {
  const config = vscode.workspace.getConfiguration(APP_CONFIG_SECTION);
  const configuredColorScheme = getColorSchemeSetting(config);

  return {
    globalScrollbar: config.get<boolean>(appConfigSections.globalScrollbar, DEFAULT_CONFIG.globalScrollbar),
    diff2html: {
      outputFormat: config.get<OutputFormatType>(
        requiredConfigSections.outputFormat,
        DEFAULT_CONFIG.diff2html.outputFormat,
      ),
      drawFileList: config.get<boolean>(requiredConfigSections.drawFileList, DEFAULT_CONFIG.diff2html.drawFileList),
      matching: config.get<LineMatchingType>(requiredConfigSections.matching, DEFAULT_CONFIG.diff2html.matching),
      matchWordsThreshold: config.get<number>(
        requiredConfigSections.matchWordsThreshold,
        DEFAULT_CONFIG.diff2html.matchWordsThreshold,
      ),
      matchingMaxComparisons: config.get<number>(
        requiredConfigSections.matchingMaxComparisons,
        DEFAULT_CONFIG.diff2html.matchingMaxComparisons,
      ),
      maxLineSizeInBlockForComparison: config.get<number>(
        requiredConfigSections.maxLineSizeInBlockForComparison,
        DEFAULT_CONFIG.diff2html.maxLineSizeInBlockForComparison,
      ),
      maxLineLengthHighlight: config.get<number>(
        requiredConfigSections.maxLineLengthHighlight,
        DEFAULT_CONFIG.diff2html.maxLineLengthHighlight,
      ),
      renderNothingWhenEmpty: config.get<boolean>(
        requiredConfigSections.renderNothingWhenEmpty,
        DEFAULT_CONFIG.diff2html.renderNothingWhenEmpty,
      ),
      colorScheme: resolveColorScheme(configuredColorScheme),
    },
  };
}

export function isAutoColorScheme(): boolean {
  return getColorSchemeSetting(vscode.workspace.getConfiguration(APP_CONFIG_SECTION)) === "auto";
}

export function setOutputFormatConfig(value: OutputFormatType): Thenable<void> {
  return vscode.workspace.getConfiguration(APP_CONFIG_SECTION).update(requiredConfigSections.outputFormat, value, true);
}

function getColorSchemeSetting(config: vscode.WorkspaceConfiguration): ColorSchemeSetting {
  return config.get<ColorSchemeSetting>(requiredConfigSections.colorScheme, "auto");
}

function resolveColorScheme(setting: ColorSchemeSetting): ColorSchemeType {
  if (setting !== "auto") {
    return setting;
  }

  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrast:
      return ColorSchemeType.DARK;
    default:
      return ColorSchemeType.LIGHT;
  }
}
