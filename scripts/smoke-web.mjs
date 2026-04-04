import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ensureSmokeFixtures } from "./generate-smoke-fixtures.mjs";

const workspacePath = resolve("smoke", "workspace");
const extensionTestsPath = resolve("smoke", "web", "index.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const isCi = process.env.CI === "true";

console.log("Building extension for smoke test...");
execFileSync(npmCommand, ["run", "build:dev"], {
  stdio: "inherit",
});

console.log("Generating smoke fixtures...");
ensureSmokeFixtures();

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
