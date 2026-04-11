import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const smokeDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = resolve(smokeDirectory, "workspace");
const hugePatchPath = resolve(workspacePath, "generated", "huge-multi-file.patch");

function generateHugeMultiFilePatch({ fileCount = 160, changedLinesPerFile = 120 } = {}) {
  const sections = [];

  for (let fileIndex = 1; fileIndex <= fileCount; fileIndex += 1) {
    const paddedIndex = String(fileIndex).padStart(4, "0");
    const filePath = `src/generated/file-${paddedIndex}.ts`;
    const removedLines = [];
    const addedLines = [];

    for (let lineIndex = 0; lineIndex < changedLinesPerFile; lineIndex += 1) {
      removedLines.push(`-export const oldValue${lineIndex} = ${lineIndex};`);
      addedLines.push(`+export const newValue${lineIndex} = ${lineIndex} + ${fileIndex};`);
    }

    sections.push(
      [
        `diff --git a/${filePath} b/${filePath}`,
        "index 1111111..2222222 100644",
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -1,${changedLinesPerFile} +1,${changedLinesPerFile} @@`,
        ...removedLines,
        ...addedLines,
        "",
      ].join("\n"),
    );
  }

  return sections.join("\n");
}

export function ensureSmokeFixtures() {
  mkdirSync(dirname(hugePatchPath), { recursive: true });
  writeFileSync(hugePatchPath, generateHugeMultiFilePatch());
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
const currentPath = fileURLToPath(import.meta.url);

if (executedPath === currentPath) {
  console.log("Generating smoke fixtures...");
  ensureSmokeFixtures();
}
