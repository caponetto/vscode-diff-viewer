/**
 * @jest-environment jsdom
 */

import { ColorSchemeType } from "diff2html/lib/types";
import { AppConfig } from "../../../../extension/configuration";
import { SkeletonElementIds } from "../../../../shared/css/elements";
import { HorizontalScrollbarController } from "../scrollbar";
import { FileDomBinding } from "../types";

const createConfig = (globalScrollbar: boolean): AppConfig => ({
  globalScrollbar,
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
});

const renderSkeleton = (): void => {
  document.body.innerHTML = `
    <footer>
      <div id="${SkeletonElementIds.FooterStatus}"></div>
      <div id="${SkeletonElementIds.HorizontalScrollbarContainer}" style="display: none">
        <div id="${SkeletonElementIds.HorizontalScrollbarContent}"></div>
      </div>
    </footer>
  `;
};

const setElementDimensions = (element: HTMLElement, dimensions: { clientWidth: number; scrollWidth: number }): void => {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: dimensions.clientWidth,
  });
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: dimensions.scrollWidth,
  });
};

const setElementRect = (element: HTMLElement, rect: { left: number; width: number }): void => {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        left: rect.left,
        width: rect.width,
        right: rect.left + rect.width,
        top: 0,
        bottom: 0,
        height: 0,
        x: rect.left,
        y: 0,
        toJSON: () => undefined,
      }) as DOMRect,
  });
};

const createSideBySideBinding = (): { binding: FileDomBinding; sideDiffs: HTMLElement[] } => {
  const fileContainer = document.createElement("div");
  fileContainer.innerHTML = `
    <div class="d2h-file-diff">
      <div class="d2h-file-side-diff"></div>
      <div class="d2h-file-side-diff"></div>
    </div>
  `;

  const sideDiffs = Array.from(fileContainer.querySelectorAll<HTMLElement>(".d2h-file-side-diff"));
  return {
    binding: {
      fileContainer,
      fileNameText: "file.ts",
      filePath: "src/file.ts",
    },
    sideDiffs,
  };
};

describe("HorizontalScrollbarController", () => {
  let config: AppConfig;
  let fileBindings: FileDomBinding[];
  let controller: HorizontalScrollbarController;

  beforeEach(() => {
    jest.clearAllMocks();
    renderSkeleton();
    config = createConfig(true);
    fileBindings = [];
    controller = new HorizontalScrollbarController({
      getConfig: () => config,
      getFileBindings: () => fileBindings,
    });
  });

  it("shows a thumb and syncs expanded file panes", () => {
    const first = createSideBySideBinding();
    const second = createSideBySideBinding();
    fileBindings = [first.binding, second.binding];

    const sideDiffs = [...first.sideDiffs, ...second.sideDiffs];
    sideDiffs.forEach((element) => setElementDimensions(element, { clientWidth: 120, scrollWidth: 420 }));

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    const thumb = document.getElementById(SkeletonElementIds.HorizontalScrollbarContent) as HTMLDivElement;
    setElementDimensions(scrollbar, { clientWidth: 120, scrollWidth: 120 });

    controller.refresh();

    expect(scrollbar.style.display).toBe("block");
    expect(thumb.style.width).toBe("34.285714285714285px");

    scrollbar.scrollLeft = 37;
    scrollbar.dispatchEvent(new Event("scroll"));

    sideDiffs.forEach((element) => {
      expect(element.scrollLeft).toBe(37);
    });

    sideDiffs[0].scrollLeft = 91;
    sideDiffs[0].dispatchEvent(new Event("scroll"));
    expect(scrollbar.scrollLeft).toBe(91);
  });

  it("falls back to the document horizontal scroll target when no file pane overflows", () => {
    const root = document.documentElement;
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: root,
    });
    setElementDimensions(root, { clientWidth: 300, scrollWidth: 900 });

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    const thumb = document.getElementById(SkeletonElementIds.HorizontalScrollbarContent) as HTMLDivElement;
    setElementDimensions(scrollbar, { clientWidth: 300, scrollWidth: 300 });

    controller.refresh();

    expect(scrollbar.style.display).toBe("block");
    expect(thumb.style.width).toBe("100px");

    scrollbar.scrollLeft = 45;
    scrollbar.dispatchEvent(new Event("scroll"));
    expect(root.scrollLeft).toBe(45);

    root.scrollLeft = 72;
    root.dispatchEvent(new Event("scroll"));
    expect(scrollbar.scrollLeft).toBe(72);
  });

  it("hides the scrollbar when the feature is disabled", () => {
    const binding = createSideBySideBinding();
    fileBindings = [binding.binding];
    binding.sideDiffs.forEach((element) => setElementDimensions(element, { clientWidth: 120, scrollWidth: 420 }));

    config = createConfig(false);
    controller.refresh();

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    expect(scrollbar.style.display).toBe("none");
  });

  it("moves the thumb and scrolls targets when the track is clicked", () => {
    const binding = createSideBySideBinding();
    fileBindings = [binding.binding];
    binding.sideDiffs.forEach((element) => setElementDimensions(element, { clientWidth: 120, scrollWidth: 420 }));

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    const thumb = document.getElementById(SkeletonElementIds.HorizontalScrollbarContent) as HTMLDivElement;
    setElementDimensions(scrollbar, { clientWidth: 120, scrollWidth: 120 });
    setElementRect(scrollbar, { left: 10, width: 120 });
    setElementRect(thumb, { left: 10, width: 34.285714285714285 });

    controller.refresh();

    scrollbar.dispatchEvent(new MouseEvent("pointerdown", { clientX: 80 }));

    expect(binding.sideDiffs[0]?.scrollLeft).toBeGreaterThan(0);
    expect(thumb.style.transform).toContain("translateX");
  });
});
