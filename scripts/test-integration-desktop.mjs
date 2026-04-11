import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";
import { ensureSmokeFixtures } from "../smoke/fixtures/generate.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = resolve(repositoryRoot, "smoke", "workspace");
const extensionTestsPath = resolve(repositoryRoot, "integration", "desktop", "index.cjs");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

console.log("Building extension for desktop integration test...");
execFileSync(npmCommand, ["run", "build:dev"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

console.log("Generating smoke fixtures...");
ensureSmokeFixtures();

console.log("Launching VS Code desktop integration test...");
await runTests({
  extensionDevelopmentPath: repositoryRoot,
  extensionTestsPath,
  launchArgs: [workspacePath, "--disable-extensions"],
});
