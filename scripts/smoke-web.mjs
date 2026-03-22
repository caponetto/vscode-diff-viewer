import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const workspacePath = resolve("smoke", "workspace");
const extensionTestsPath = resolve("smoke", "web", "index.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const largePatchPath = resolve(workspacePath, "large.patch");
const largeFilePath = resolve(workspacePath, "src", "large-file.ts");
const isCi = process.env.CI === "true";

function createLargeDiffFixture() {
  mkdirSync(resolve(workspacePath, "src"), { recursive: true });

  const repeatedLines = Array.from({ length: 7_000 }, (_, index) => `-export const oldValue${index} = ${index};`).join(
    "\n",
  );
  const addedLines = Array.from({ length: 7_000 }, (_, index) => `+export const newValue${index} = ${index + 1};`).join(
    "\n",
  );
  const patch = [
    "diff --git a/src/large-file.ts b/src/large-file.ts",
    "index 9999999..aaaaaaa 100644",
    "--- a/src/large-file.ts",
    "+++ b/src/large-file.ts",
    "@@ -1,7000 +1,7000 @@",
    repeatedLines,
    addedLines,
    "",
  ].join("\n");

  const fileContent = Array.from({ length: 7_000 }, (_, index) => `export const newValue${index} = ${index + 1};`).join(
    "\n",
  );

  console.log("Creating smoke large-diff fixture...");

  writeFileSync(largePatchPath, patch, "utf8");
  writeFileSync(largeFilePath, `${fileContent}\n`, "utf8");
}

createLargeDiffFixture();

console.log("Building extension for smoke test...");
execFileSync(npmCommand, ["run", "build:dev"], {
  stdio: "inherit",
});

console.log("Launching VS Code web smoke test...");
execFileSync(
  npxCommand,
  [
    "vscode-test-web",
    "--browserType=chromium",
    "--extensionDevelopmentPath=.",
    "--extensionTestsPath",
    extensionTestsPath,
    "--quality",
    "stable",
    "--esm",
    ...(isCi ? ["--headless"] : []),
    workspacePath,
  ],
  {
    stdio: "inherit",
  },
);
