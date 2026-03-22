import { DiffFile } from "diff2html/lib/types";
import { extractNewFileNameFromDiffName } from "../../../shared/extract";
import { UpdateWebviewPayload } from "../api";
import { getSha1Hash } from "../hash";
import { DiffFileHashMap, DiffFileViewModel } from "./types";

export function normalizeDiffFilePath(path?: string): string | undefined {
  if (!path || path === "/dev/null") {
    return;
  }

  const normalizedPath = extractNewFileNameFromDiffName(path);
  return normalizedPath === "/dev/null" ? undefined : normalizedPath;
}

export function buildDiffFileViewModel(diffFile: DiffFile, accessiblePaths: ReadonlySet<string>): DiffFileViewModel {
  const oldPath = normalizeDiffFilePath(diffFile.oldName);
  const newPath = normalizeDiffFilePath(diffFile.newName);
  const primaryPath = newPath ?? oldPath ?? "";

  return {
    primaryPath,
    oldPath,
    newPath,
    isOldPathAccessible: oldPath ? accessiblePaths.has(oldPath) : false,
    isNewPathAccessible: newPath ? accessiblePaths.has(newPath) : false,
  };
}

export function buildDiffFileMap(diffFiles: DiffFile[], accessiblePaths: ReadonlySet<string>): DiffFileHashMap {
  return Object.fromEntries(
    diffFiles.flatMap((diffFile) => {
      const filePath = buildDiffFileViewModel(diffFile, accessiblePaths).primaryPath;
      return filePath ? [[filePath, diffFile] as const] : [];
    }),
  );
}

export async function buildDiffHashes(args: {
  payload: UpdateWebviewPayload;
  currentDiffFilesByPath: DiffFileHashMap;
  accessiblePaths: ReadonlySet<string>;
}): Promise<Record<string, string>> {
  const targetPaths = args.payload.performance.deferViewedStateHashing
    ? Object.keys(args.payload.viewedState)
    : args.payload.diffFiles
        .map((diffFile) => buildDiffFileViewModel(diffFile, args.accessiblePaths).primaryPath)
        .filter((filePath): filePath is string => filePath.length > 0);

  const entries = await Promise.all(
    targetPaths.map(async (fileName) => {
      if (!fileName) {
        return undefined;
      }

      const diffFile = args.currentDiffFilesByPath[fileName];
      if (!diffFile) {
        return undefined;
      }

      return [fileName, await getSha1Hash(JSON.stringify(diffFile))] as const;
    }),
  );

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
}
