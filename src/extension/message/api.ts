export interface MessageToExtensionApi {
  pong: () => Promise<void>;
  openFile: (payload: { path: string; line?: number }) => Promise<void>;
}
