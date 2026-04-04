/**
 * @jest-environment jsdom
 */

import { SkeletonElementIds } from "../../../../shared/css/elements";
import { setupTheme, showEmpty, showLoading, updateFooter, updateHighlightTheme, updateLargeDiffNotice } from "../ui";

describe("message/handler/ui", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="${SkeletonElementIds.LoadingContainer}" style="display:none"></div>
      <div id="${SkeletonElementIds.EmptyMessageContainer}" style="display:none"></div>
      <div id="${SkeletonElementIds.LargeDiffNoticeContainer}" style="display:none">
        <span id="${SkeletonElementIds.LargeDiffNoticeMessage}"></span>
        <button id="${SkeletonElementIds.LargeDiffNoticeDismiss}" type="button">Close</button>
      </div>
      <link id="${SkeletonElementIds.HighlightLightStylesheet}" rel="stylesheet" />
      <link id="${SkeletonElementIds.HighlightDarkStylesheet}" rel="stylesheet" />
      <span id="${SkeletonElementIds.ViewedIndicator}"></span>
      <progress id="${SkeletonElementIds.ViewedProgressContainer}" max="100" value="0"></progress>
    `;

    Object.defineProperty(globalThis, "getComputedStyle", {
      value: () => ({
        getPropertyValue: (name: string) => `${name}-value`,
      }),
      configurable: true,
    });
  });

  it("updates theme css variables and highlight stylesheets", () => {
    setupTheme("dark");
    updateHighlightTheme("dark");

    expect(document.documentElement.style.getPropertyValue("--diff-viewer--background")).toBe(
      "--diff-viewer--background--dark-value",
    );
    expect((document.getElementById(SkeletonElementIds.HighlightLightStylesheet) as HTMLLinkElement).disabled).toBe(
      true,
    );
  });

  it("toggles loading, empty and large diff notice", () => {
    showLoading(true);
    showEmpty(true);
    updateLargeDiffNotice("Large diff");

    expect((document.getElementById(SkeletonElementIds.LoadingContainer) as HTMLDivElement).style.display).toBe(
      "block",
    );
    expect((document.getElementById(SkeletonElementIds.EmptyMessageContainer) as HTMLDivElement).style.display).toBe(
      "block",
    );
    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeMessage) as HTMLSpanElement).textContent).toBe(
      "Large diff",
    );
    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement).style.display).toBe(
      "flex",
    );
  });

  it("dismisses the large diff notice for the same warning only", () => {
    updateLargeDiffNotice("Large diff");

    (document.getElementById(SkeletonElementIds.LargeDiffNoticeDismiss) as HTMLButtonElement).click();
    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement).style.display).toBe(
      "none",
    );

    updateLargeDiffNotice("Large diff");
    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement).style.display).toBe(
      "none",
    );

    updateLargeDiffNotice("Large diff again");
    expect((document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer) as HTMLDivElement).style.display).toBe(
      "flex",
    );
  });

  it("updates footer progress from file bindings", () => {
    updateFooter([
      {
        fileContainer: document.createElement("div"),
        filePath: "a",
        fileNameText: "a",
        viewedToggle: Object.assign(document.createElement("input"), { checked: true }),
      },
      {
        fileContainer: document.createElement("div"),
        filePath: "b",
        fileNameText: "b",
        viewedToggle: Object.assign(document.createElement("input"), { checked: false }),
      },
    ]);

    expect(document.getElementById(SkeletonElementIds.ViewedIndicator)?.textContent).toBe("1 / 2 files viewed");
    expect((document.getElementById(SkeletonElementIds.ViewedProgressContainer) as HTMLProgressElement).value).toBe(50);
  });
});
