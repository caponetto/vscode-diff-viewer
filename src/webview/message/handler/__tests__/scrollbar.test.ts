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

const createPointerEvent = (type: string, init: { clientX: number; pointerId: number }): PointerEvent => {
  const event = new MouseEvent(type, { bubbles: true, clientX: init.clientX }) as PointerEvent;
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: init.pointerId,
  });
  return event;
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

const createInlineBinding = (): { binding: FileDomBinding; content: HTMLElement } => {
  const fileContainer = document.createElement("div");
  fileContainer.innerHTML = `<div class="d2h-file-diff"></div>`;

  const content = fileContainer.querySelector<HTMLElement>(".d2h-file-diff");
  if (!content) {
    throw new Error("Expected inline diff content to be rendered.");
  }

  return {
    binding: {
      fileContainer,
      fileNameText: "file.ts",
      filePath: "src/file.ts",
    },
    content,
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

  it("hides the scrollbar when all file panes are collapsed and the page does not overflow", () => {
    const binding = createSideBySideBinding();
    fileBindings = [binding.binding];
    const fileContent = binding.binding.fileContainer.querySelector<HTMLElement>(".d2h-file-diff");
    fileContent?.classList.add("d2h-d-none");
    binding.sideDiffs.forEach((element) => setElementDimensions(element, { clientWidth: 120, scrollWidth: 420 }));

    const root = document.documentElement;
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: root,
    });
    setElementDimensions(root, { clientWidth: 300, scrollWidth: 300 });

    controller.refresh();

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    const thumb = document.getElementById(SkeletonElementIds.HorizontalScrollbarContent) as HTMLDivElement;
    expect(scrollbar.style.display).toBe("none");
    expect(thumb.style.width).toBe("0px");
  });

  it("uses the whole file content as the target when no side-by-side pane overflows", () => {
    const binding = createInlineBinding();
    fileBindings = [binding.binding];
    setElementDimensions(binding.content, { clientWidth: 140, scrollWidth: 560 });

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    const thumb = document.getElementById(SkeletonElementIds.HorizontalScrollbarContent) as HTMLDivElement;
    setElementDimensions(scrollbar, { clientWidth: 140, scrollWidth: 140 });

    controller.refresh();

    expect(scrollbar.style.display).toBe("block");
    expect(thumb.style.width).toBe("35px");

    scrollbar.scrollLeft = 70;
    scrollbar.dispatchEvent(new Event("scroll"));
    expect(binding.content.scrollLeft).toBe(70);
  });

  it("updates scroll listeners when the active file targets change", () => {
    const first = createInlineBinding();
    const second = createInlineBinding();
    fileBindings = [first.binding];
    setElementDimensions(first.content, { clientWidth: 100, scrollWidth: 300 });
    setElementDimensions(second.content, { clientWidth: 100, scrollWidth: 300 });

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    setElementDimensions(scrollbar, { clientWidth: 100, scrollWidth: 100 });

    controller.refresh();
    fileBindings = [second.binding];
    controller.refresh();

    first.content.scrollLeft = 80;
    first.content.dispatchEvent(new Event("scroll"));
    expect(scrollbar.scrollLeft).toBe(0);

    second.content.scrollLeft = 60;
    second.content.dispatchEvent(new Event("scroll"));
    expect(scrollbar.scrollLeft).toBe(60);
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

  it("drags the thumb until the matching pointer is released", () => {
    const binding = createSideBySideBinding();
    fileBindings = [binding.binding];
    binding.sideDiffs.forEach((element) => setElementDimensions(element, { clientWidth: 120, scrollWidth: 420 }));

    const scrollbar = document.getElementById(SkeletonElementIds.HorizontalScrollbarContainer) as HTMLDivElement;
    const thumb = document.getElementById(SkeletonElementIds.HorizontalScrollbarContent) as HTMLDivElement;
    const setPointerCapture = jest.fn();
    const releasePointerCapture = jest.fn();
    thumb.setPointerCapture = setPointerCapture;
    thumb.releasePointerCapture = releasePointerCapture;
    setElementDimensions(scrollbar, { clientWidth: 120, scrollWidth: 120 });
    setElementRect(scrollbar, { left: 10, width: 120 });
    setElementRect(thumb, { left: 20, width: 34.285714285714285 });

    controller.refresh();

    thumb.dispatchEvent(createPointerEvent("pointerdown", { clientX: 35, pointerId: 7 }));
    thumb.dispatchEvent(createPointerEvent("pointermove", { clientX: 90, pointerId: 99 }));
    expect(binding.sideDiffs[0]?.scrollLeft).toBe(0);

    thumb.dispatchEvent(createPointerEvent("pointermove", { clientX: 90, pointerId: 7 }));
    expect(binding.sideDiffs[0]?.scrollLeft).toBeGreaterThan(0);

    thumb.dispatchEvent(createPointerEvent("pointerup", { clientX: 90, pointerId: 7 }));
    const scrollLeftAfterRelease = binding.sideDiffs[0]?.scrollLeft;
    thumb.dispatchEvent(createPointerEvent("pointermove", { clientX: 100, pointerId: 7 }));

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(binding.sideDiffs[0]?.scrollLeft).toBe(scrollLeftAfterRelease);
  });

  it("cancels an already scheduled refresh before scheduling the next one", () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    const animationFrameIds = [12, 24];
    const requestAnimationFrame = jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback): number => {
        const frameId = animationFrameIds.shift() ?? 36;
        animationFrames.set(frameId, callback);
        return frameId;
      });
    const cancelAnimationFrame = jest.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((frameId) => {
      animationFrames.delete(frameId);
    });

    controller.scheduleRefresh();
    expect(Reflect.get(controller, "pendingRefreshFrame")).toBe(12);

    controller.scheduleRefresh();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(12);
    expect(Reflect.get(controller, "pendingRefreshFrame")).toBe(24);
    expect(animationFrames.has(12)).toBe(false);

    Array.from(animationFrames.values()).forEach((callback) => callback(0));

    expect(Reflect.get(controller, "pendingRefreshFrame")).toBeUndefined();

    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
  });
});
