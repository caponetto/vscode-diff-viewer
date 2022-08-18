import { DiffFile } from "diff2html/lib/types";
import { AppConfig } from "../../extension/configuration";
import { ViewedState } from "../../extension/viewed-state";

export interface UpdateWebviewPayload {
  config: AppConfig;
  diffFiles: DiffFile[];
  diffContainer: string;
  viewedState: ViewedState;
}

export interface MessageToWebviewApi {
  ping: () => Promise<void>;
  updateWebview: (payload: UpdateWebviewPayload) => Promise<void>;
}
