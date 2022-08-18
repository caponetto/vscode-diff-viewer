import * as vscode from "vscode";

export type ViewedValue = boolean;

export interface ViewedState {
  [path: string]: ViewedValue;
}

export class ViewedStateStore {
  // transient state is used if args.docId is empty
  private transientViewedState: ViewedState = {};

  public constructor(public args: { docId?: string; context: vscode.ExtensionContext }) {}

  public getViewedState(): ViewedState {
    if (!this.args.docId) {
      return this.transientViewedState;
    }

    const savedState = this.args.context.workspaceState.get<ViewedState>(this.args.docId);
    return savedState || this.transientViewedState;
  }

  public toggleViewedState(args: { path: string; value: ViewedValue }): void {
    const viewedState = this.getViewedState();

    if (args.value) {
      viewedState[args.path] = args.value;
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
      const savedState = this.args.context.workspaceState.update(this.args.docId, viewedState);
    }
  }
}
