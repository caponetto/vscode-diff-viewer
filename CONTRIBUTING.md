# Contributing

Thanks for contributing to Diff Viewer.

## Prerequisites

- Node.js 22+
- npm
- VS Code

## Setup

```bash
npm ci
```

The repository declares `engines.node = 22.x` in `package.json`. Using Node 22 locally keeps installs, tests, and webpack output aligned with CI and contributor expectations. The repo also includes `.nvmrc` and `.node-version` set to `22` for local toolchains that read them.

## Common Commands

```bash
npm run build:dev
npm test
npm run test:coverage:ci
npm run test:integration:desktop
npm run smoke:web
npm run test:all
npm run lint
npm run format:check
npx tsc --noEmit -p tsconfig.json
```

## Web Smoke Test

```bash
npx playwright install chromium
npm run smoke:web
```

The smoke flow builds the extension, launches VS Code Web, and runs browser-hosted extension tests against sample patch fixtures, including a generated large-diff case.
Playwright's Chromium browser must be installed locally before running the smoke command.

## Desktop Integration Test

```bash
npm run test:integration:desktop
```

The desktop integration flow builds the extension, launches a real Extension Development Host through `@vscode/test-electron`, and verifies activation, custom editor opening, raw-file fallback, collapsed opening, and a configuration-driven rerender.
On headless Linux environments, run it through `xvfb-run -a npm run test:integration:desktop`, which is also how GitHub Actions executes the desktop lane.

## Local Development

- Open the workspace in VS Code.
- Run the extension in an Extension Development Host or use the web smoke flow above for browser-mode coverage.
- Open `.diff` or `.patch` files to exercise the custom editor.

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Run the relevant verification commands before opening a PR. At minimum, mirror the checks affected by your change; for CI parity on Linux, that usually means `npm run format:check`, `npm run test:coverage:ci`, `npm run smoke:web`, and `xvfb-run -a npm run test:integration:desktop`.
