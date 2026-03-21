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

The repository declares `engines.node = 22.x` in `package.json`. Using Node 22 locally keeps installs, tests, and webpack output aligned with CI and contributor expectations.

## Common Commands

```bash
npm run build:dev
npm test
npm run lint
npx tsc --noEmit -p tsconfig.json
```

## Web Smoke Test

```bash
npx playwright install chromium
npm run smoke:web
```

The smoke flow builds the extension, launches VS Code Web, and runs browser-hosted extension tests against sample patch fixtures, including a generated large-diff case.
Playwright's Chromium browser must be installed locally before running the smoke command.

## Local Development

- Open the workspace in VS Code.
- Run the extension in an Extension Development Host or use the web smoke flow above for browser-mode coverage.
- Open `.diff` or `.patch` files to exercise the custom editor.

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Run the verification commands before opening a PR.
