import * as vscode from "vscode";

export type ViewedState = Record<string, string>;

export class ViewedStateStore {
  // transient state is used if args.docId is empty
  private transientViewedState: ViewedState = {};

  public constructor(private args: { docId?: string; context: vscode.ExtensionContext }) {}

  public getViewedState(): ViewedState {
    if (!this.args.docId) {
      return this.transientViewedState;
    }

    const savedState = this.args.context.workspaceState.get<ViewedState>(this.args.docId);
    return savedState || this.transientViewedState;
  }

  public toggleViewedState(args: { path: string; viewedSha1: string | null }): void {
    const viewedState = this.getViewedState();

    if (args.viewedSha1) {
      viewedState[args.path] = args.viewedSha1;
    } else {
      // no need to store false
      delete viewedState[args.path];
    }

    this.saveViewedState(viewedState);
  }

  private saveViewedState(viewedState: ViewedState): void {
    if (!this.args.docId) {
      this.transientViewedState = viewedState;
    } else {
      this.args.context.workspaceState.update(this.args.docId, viewedState);
    }
  }
}
