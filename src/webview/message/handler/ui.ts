import { CssPropertiesBasedOnTheme, SkeletonElementIds } from "../../../shared/css/elements";
import { AppTheme } from "../../../shared/types";
import { FileDomBinding } from "./types";

export function setupTheme(theme: AppTheme): void {
  const root = document.documentElement;

  CssPropertiesBasedOnTheme.forEach((property) => {
    const value = getComputedStyle(root).getPropertyValue(`${property}--${theme}`);
    root.style.setProperty(property, value);
  });
}

export function updateHighlightTheme(theme: AppTheme): void {
  const lightStylesheet = document.getElementById(SkeletonElementIds.HighlightLightStylesheet);
  const darkStylesheet = document.getElementById(SkeletonElementIds.HighlightDarkStylesheet);
  if (!(lightStylesheet instanceof HTMLLinkElement) || !(darkStylesheet instanceof HTMLLinkElement)) {
    return;
  }

  lightStylesheet.disabled = theme === "dark";
  darkStylesheet.disabled = theme !== "dark";
}

export function updateLargeDiffNotice(warning?: string): void {
  const notice = document.getElementById(SkeletonElementIds.LargeDiffNoticeContainer);
  if (!notice) {
    return;
  }

  notice.textContent = warning ?? "";
  notice.style.display = warning ? "block" : "none";
}

export function showLoading(isLoading: boolean): void {
  const loadingContainer = document.getElementById(SkeletonElementIds.LoadingContainer);
  if (!loadingContainer) {
    return;
  }

  loadingContainer.style.display = isLoading ? "block" : "none";
}

export function showEmpty(isEmpty: boolean): void {
  const emptyMessageContainer = document.getElementById(SkeletonElementIds.EmptyMessageContainer);
  if (!emptyMessageContainer) {
    return;
  }

  emptyMessageContainer.style.display = isEmpty ? "block" : "none";
}

export function updateFooter(fileBindings: FileDomBinding[]): void {
  const indicator = document.getElementById(SkeletonElementIds.ViewedIndicator);
  if (!indicator) {
    return;
  }

  const allCount = fileBindings.length;
  if (allCount === 0) {
    return;
  }

  const viewedCount = fileBindings.reduce((count, { viewedToggle }) => count + (viewedToggle?.checked ? 1 : 0), 0);
  indicator.textContent = `${viewedCount} / ${allCount} files viewed`;

  const viewedProgressContainer = document.getElementById(SkeletonElementIds.ViewedProgressContainer);
  if (viewedProgressContainer instanceof HTMLProgressElement) {
    viewedProgressContainer.value = Math.round((viewedCount / allCount) * 100);
  }
}
