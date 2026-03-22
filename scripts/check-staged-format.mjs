import { execFileSync } from "node:child_process";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function getStagedFiles() {
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    encoding: "utf8",
  });

  return output
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean);
}

const files = getStagedFiles();
if (files.length === 0) {
  process.exit(0);
}

execFileSync(npxCommand, ["prettier", "--check", "--ignore-unknown", ...files], {
  stdio: "inherit",
});
