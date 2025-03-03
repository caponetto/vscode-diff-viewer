import * as vscode from "vscode";
import { SkeletonElementIds } from "../shared/css/elements";

export const buildSkeleton = (args: { webviewUri: vscode.Uri; cssUris: vscode.Uri[] }): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <title></title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  ${args.cssUris.map((cssUri) => `<link rel="stylesheet" href="${cssUri}">`).join("\n")}
</head>
<body>
  <div id="${SkeletonElementIds.LoadingContainer}">
    <span>Loading...</span>
  </div>
  <div id="${SkeletonElementIds.EmptyMessageContainer}" style="display: none">
    <span>Empty diff file</span>
  </div>
  <div id="${SkeletonElementIds.DiffContainer}"></div>
  <footer>
    <span id="${SkeletonElementIds.ViewedIndicator}"></span>
    <div id="${SkeletonElementIds.ViewedProgressContainer}">
      <div id="${SkeletonElementIds.ViewedProgress}"></div>
    </div>
    <label id="${SkeletonElementIds.MarkAllViewedContainer}">
      <input id="${SkeletonElementIds.MarkAllViewedCheckbox}" type="checkbox" name="mark-all-as-viewed">
        Mark all as viewed
      </input>
    </label>
  </footer>
  <script src="${args.webviewUri}"></script>
</body>
</html>
`;
