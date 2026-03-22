import { DiffFile } from "diff2html/lib/types";
import { WebviewUiState } from "../api";

export const CHANGED_SINCE_VIEWED = "changed-since-last-view";
export const SELECTED_FILE = "selected-file";
export const FILE_ACTIONS_CLASS = "diff-viewer-file-actions";
export const FILE_ACTION_BUTTON_CLASS = "diff-viewer-file-action-button";
export const DEFAULT_UI_STATE: WebviewUiState = { scrollTop: 0 };

export interface FileDomBinding {
  fileContainer: HTMLElement;
  filePath: string;
  fileNameText: string;
  viewedToggle?: HTMLInputElement;
}

export interface DiffFileViewModel {
  primaryPath: string;
  oldPath?: string;
  newPath?: string;
  isOldPathAccessible: boolean;
  isNewPathAccessible: boolean;
}

export interface WebviewStateAdapter {
  getState: () => WebviewUiState | undefined;
  setState: (state: WebviewUiState) => void;
}

export type DiffFileHashMap = Record<string, DiffFile>;
