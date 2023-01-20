import * as vscode from "vscode";
import { SkeletonElementIds } from "../shared/css/elements";

export const buildSkeleton = (webviewUri: vscode.Uri) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <title></title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body>
  <div id="${SkeletonElementIds.LoadingContainer}">
    <span>Loading...</span>
  </div>
  <div id="${SkeletonElementIds.EmptyMessageContainer}" style="display: none">
    <span>Empty diff</span>
  </div>
  <div id="${SkeletonElementIds.DiffContainer}"></div>
  <footer>
    <button id="${SkeletonElementIds.ViewedResetButton}">Reset</button>
    <span id="${SkeletonElementIds.ViewedIndicator}"></span>
  </footer>
  <script src="${webviewUri}"></script>
</body>
</html>
`;
