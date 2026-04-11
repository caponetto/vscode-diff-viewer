import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSmokeFixtures } from "../smoke/fixtures/generate.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = resolve(repositoryRoot, "smoke", "workspace");
const extensionTestsPath = resolve(repositoryRoot, "smoke", "tests", "web.cjs");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const isCi = process.env.CI === "true";

console.log("Building extension for smoke test...");
execFileSync(npmCommand, ["run", "build:dev"], {
  cwd: repositoryRoot,
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
    `--extensionDevelopmentPath=${repositoryRoot}`,
    `--extensionTestsPath=${extensionTestsPath}`,
    "--quality",
    "stable",
    "--esm",
    ...(isCi ? ["--headless"] : []),
    workspacePath,
  ],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
  },
);
