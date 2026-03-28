import * as vscode from "vscode";
import skeletonTemplate from "./skeleton.html";

interface BuildSkeletonArgs {
  webviewUri: vscode.Uri;
  commonCssUris: vscode.Uri[];
  lightHighlightCssUri: vscode.Uri;
  darkHighlightCssUri: vscode.Uri;
  cspSource: string;
  nonce: string;
  shellGeneration: number;
}

const renderCommonCssLinks = (cssUris: vscode.Uri[]): string =>
  cssUris.map((cssUri) => `<link rel="stylesheet" href="${cssUri}">`).join("\n  ");

const replaceTemplateToken = (args: { template: string; token: string; value: string }): string =>
  args.template.replaceAll(`{{${args.token}}}`, args.value);

export const buildSkeleton = (args: BuildSkeletonArgs): string =>
  [
    ["CSP_SOURCE", args.cspSource],
    ["NONCE", args.nonce],
    ["COMMON_CSS_LINKS", renderCommonCssLinks(args.commonCssUris)],
    ["LIGHT_HIGHLIGHT_CSS_URI", args.lightHighlightCssUri.toString()],
    ["DARK_HIGHLIGHT_CSS_URI", args.darkHighlightCssUri.toString()],
    ["WEBVIEW_URI", args.webviewUri.toString()],
    ["SHELL_GENERATION", String(args.shellGeneration)],
  ].reduce(
    (template, [token, value]) =>
      replaceTemplateToken({
        template,
        token,
        value,
      }),
    skeletonTemplate,
  );
