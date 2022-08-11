import { DiffFile } from "diff2html/lib/types";
import { AppConfig } from "../../extension/configuration";

export interface MessageToWebviewApi {
  ping: () => Promise<void>;
  updateWebview: (payload: { config: AppConfig; diffFiles: DiffFile[]; diffContainer: string }) => Promise<void>;
}
