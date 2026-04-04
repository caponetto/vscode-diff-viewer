import { ColorSchemeType } from "diff2html/lib/types";
import { createRenderPlan, isActiveRenderRequest } from "../rendering";

describe("provider/rendering", () => {
  const config = {
    globalScrollbar: false,
    diff2html: {
      outputFormat: "side-by-side" as const,
      drawFileList: true,
      matching: "none" as const,
      matchWordsThreshold: 0.25,
      matchingMaxComparisons: 2500,
      maxLineSizeInBlockForComparison: 200,
      maxLineLengthHighlight: 10000,
      renderNothingWhenEmpty: false,
      colorScheme: ColorSchemeType.LIGHT,
    },
  };

  it("keeps the requested output format and collapses large diffs", () => {
    const plan = createRenderPlan({
      requestedConfig: config,
      text: "x".repeat(600_000),
      diffFiles: [],
      collapseAll: false,
    });

    expect(plan.collapseAll).toBe(true);
    expect(plan.performance.isLargeDiff).toBe(true);
    expect(plan.performance.deferViewedStateHashing).toBe(true);
    expect(plan.config).toBe(config);
    expect(plan.performance.warning).toContain("Large diff detected.");
  });

  it("keeps the requested config for non-large diffs", () => {
    const plan = createRenderPlan({
      requestedConfig: config,
      text: "small diff",
      diffFiles: [],
      collapseAll: false,
    });

    expect(plan.collapseAll).toBe(false);
    expect(plan.performance.isLargeDiff).toBe(false);
    expect(plan.config).toBe(config);
  });

  it("checks whether a render request is still active", () => {
    expect(isActiveRenderRequest({ webviewContext: { isDisposed: false, renderRequestId: 3 }, requestId: 3 })).toBe(
      true,
    );
    expect(isActiveRenderRequest({ webviewContext: { isDisposed: true, renderRequestId: 3 }, requestId: 3 })).toBe(
      false,
    );
    expect(isActiveRenderRequest({ webviewContext: { isDisposed: false, renderRequestId: 3 }, requestId: 2 })).toBe(
      false,
    );
  });
});
