/** @jest-environment jsdom */
import { FindController, findTextRanges } from "../find";

describe("diff find", () => {
  let highlights: Map<string, unknown>;
  beforeEach(() => {
    document.body.innerHTML = `<div id="diff-container"><span class="d2h-code-line-ctn"><b>Hello</b> World hello</span><span class="d2h-code-line-ctn">a.b [x]</span><div style="display:none"><span class="d2h-code-line-ctn">hello</span></div></div>`;
    highlights = new Map();
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: { highlights } });
    Object.defineProperty(globalThis, "Highlight", {
      configurable: true,
      value: class {
        constructor(...ranges: Range[]) {
          return ranges;
        }
      },
    });
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });
  it("matches text across syntax spans, respects case and excludes collapsed content", () => {
    const root = document.getElementById("diff-container")!;
    expect(findTextRanges(root, "hello world").map((r) => r.toString())).toEqual(["Hello World"]);
    expect(findTextRanges(root, "hello")).toHaveLength(2);
    expect(findTextRanges(root, "hello", true)).toHaveLength(1);
    expect(findTextRanges(root, "[x]").map((r) => r.toString())).toEqual(["[x]"]);
    expect(findTextRanges(root, "a.b").map((r) => r.toString())).toEqual(["a.b"]);
    expect(findTextRanges(root, "")).toHaveLength(0);
  });
  it("navigates and wraps matches, closes, and never takes focus on refresh", () => {
    const controller = new FindController();
    controller.open();
    const input = document.querySelector<HTMLInputElement>('#diff-find-widget input[type="text"]')!;
    const count = document.querySelector("#diff-find-widget span")!;
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    expect(count.textContent).toBe("1 / 2");
    expect(highlights.get("diff-find")).toHaveLength(2);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(count.textContent).toBe("2 / 2");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(count.textContent).toBe("1 / 2");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    expect(count.textContent).toBe("2 / 2");
    input.blur();
    const focus = jest.spyOn(input, "focus");
    jest.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    controller.refresh();
    expect(focus).not.toHaveBeenCalled();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("diff-find-widget")!.hidden).toBe(true);
    expect(highlights.size).toBe(0);
  });
  it("rebuilds ranges after a diff rerender and reports no matches", () => {
    const controller = new FindController();
    controller.open();
    const input = document.querySelector<HTMLInputElement>('#diff-find-widget input[type="text"]')!;
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    document.getElementById("diff-container")!.innerHTML = '<span class="d2h-code-line-ctn">goodbye</span>';
    controller.refresh();
    expect(document.querySelector("#diff-find-widget span")!.textContent).toBe("0 / 0");
    expect(highlights.get("diff-find")).toHaveLength(0);
  });
});
