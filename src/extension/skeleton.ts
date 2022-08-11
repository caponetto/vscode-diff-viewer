import * as vscode from "vscode";

export enum SkeletonElementIds {
  DiffContainer = "diff-container",
}

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
  <div id="${SkeletonElementIds.DiffContainer}"></div>
  <footer />
  <script src="${webviewUri}"></script>
</body>
</html>
`;
