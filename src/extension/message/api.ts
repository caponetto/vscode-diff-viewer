import { ViewedValue } from "../viewed-state";

export interface MessageToExtensionApi {
  pong: () => Promise<void>;
  openFile: (payload: { path: string; line?: number }) => Promise<void>;
  toggleFileViewed: (payload: { path: string; value: ViewedValue }) => void;
}
