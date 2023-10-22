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

type RequiredConfigIds = typeof requiredConfigSections[keyof typeof requiredConfigSections];

export type RequiredDiff2HtmlConfig = Required<Pick<Diff2HtmlConfig, RequiredConfigIds>>;

export type AppConfig = { diff2html: RequiredDiff2HtmlConfig };

const DEFAULT_CONFIG: AppConfig = {
  diff2html: {
    outputFormat: "side-by-side",
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
  return {
    diff2html: {
      outputFormat: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<OutputFormatType>(requiredConfigSections.outputFormat, DEFAULT_CONFIG.diff2html.outputFormat),
      drawFileList: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<boolean>(requiredConfigSections.drawFileList, DEFAULT_CONFIG.diff2html.drawFileList),
      matching: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<LineMatchingType>(requiredConfigSections.matching, DEFAULT_CONFIG.diff2html.matching),
      matchWordsThreshold: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<number>(requiredConfigSections.matchWordsThreshold, DEFAULT_CONFIG.diff2html.matchWordsThreshold),
      matchingMaxComparisons: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<number>(requiredConfigSections.matchingMaxComparisons, DEFAULT_CONFIG.diff2html.matchingMaxComparisons),
      maxLineSizeInBlockForComparison: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<number>(
          requiredConfigSections.maxLineSizeInBlockForComparison,
          DEFAULT_CONFIG.diff2html.maxLineSizeInBlockForComparison
        ),
      maxLineLengthHighlight: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<number>(requiredConfigSections.maxLineLengthHighlight, DEFAULT_CONFIG.diff2html.maxLineLengthHighlight),
      renderNothingWhenEmpty: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<boolean>(requiredConfigSections.renderNothingWhenEmpty, DEFAULT_CONFIG.diff2html.renderNothingWhenEmpty),
      colorScheme: vscode.workspace
        .getConfiguration(APP_CONFIG_SECTION)
        .get<ColorSchemeType>(requiredConfigSections.colorScheme, DEFAULT_CONFIG.diff2html.colorScheme),
    },
  };
}

export function setOutputFormatConfig(value: OutputFormatType) {
  return vscode.workspace.getConfiguration(APP_CONFIG_SECTION).update(requiredConfigSections.outputFormat, value, true);
}
