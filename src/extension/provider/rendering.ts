import { parse } from "diff2html";
import { AppConfig } from "../configuration";
import { WebviewRenderPlan } from "./types";

const LARGE_DIFF_TEXT_THRESHOLD = 512_000;
const LARGE_DIFF_FILE_THRESHOLD = 150;

export function createRenderPlan(args: {
  requestedConfig: AppConfig;
  text: string;
  diffFiles: ReturnType<typeof parse>;
  collapseAll: boolean;
}): WebviewRenderPlan {
  const isLargeDiff =
    args.text.length >= LARGE_DIFF_TEXT_THRESHOLD || args.diffFiles.length >= LARGE_DIFF_FILE_THRESHOLD;
  const warningParts: string[] = [];

  if (isLargeDiff) {
    warningParts.push("Large diff detected. Files are opened collapsed to reduce initial render cost.");
  }

  return {
    collapseAll: args.collapseAll || isLargeDiff,
    performance: {
      isLargeDiff,
      warning: warningParts.length > 0 ? warningParts.join(" ") : undefined,
      deferViewedStateHashing: isLargeDiff,
    },
    config: args.requestedConfig,
  };
}

export function isActiveRenderRequest(args: {
  webviewContext: { isDisposed: boolean; renderRequestId: number };
  requestId: number;
}): boolean {
  return !args.webviewContext.isDisposed && args.requestId === args.webviewContext.renderRequestId;
}
