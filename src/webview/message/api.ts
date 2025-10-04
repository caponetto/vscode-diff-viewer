import { DiffFile } from "diff2html/lib/types";
import { AppConfig } from "../../extension/configuration";
import { ViewedState } from "../../extension/viewed-state";

export interface UpdateWebviewPayload {
  config: AppConfig;
  diffFiles: DiffFile[];
  viewedState: ViewedState;
  collapseAll: boolean;
}

export interface MessageToWebviewApi {
  ping: () => void;
  prepare: () => void;
  updateWebview: (payload: UpdateWebviewPayload) => Promise<void>;
}
