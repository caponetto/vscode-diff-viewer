export interface MessageToExtensionApi {
  pong: () => Promise<void>;
  openFile: (payload: { path: string; line?: number }) => Promise<void>;
  toggleFileViewed: (payload: { path: string; viewedSha1: string | null }) => void;
}
