# Smoke Test Layout

The smoke test assets are intentionally split by responsibility:

- `../scripts/smoke-web.mjs` is the top-level command entrypoint used by `npm run smoke:web`.
- `./fixtures/generate.mjs` owns generated smoke inputs such as `workspace/generated/huge-multi-file.patch`.
- `./tests/web.cjs` is the VS Code web test harness loaded by `vscode-test-web`.
- `./tests/helpers.cjs` contains the shared editor, raw-file, active-editor, and internal test-command helpers reused by the desktop integration flow.
- `./workspace/` contains the sample `.diff` and `.patch` files opened during the smoke run.

Keeping these files in JavaScript is a reasonable tradeoff for this repository:

- the scripts run directly in Node without an extra build step
- the VS Code smoke harness can stay in the module format expected by the runner
- the main TypeScript configuration stays focused on extension source under `src/`

The web smoke flow now validates rendered webview state, command-driven layout and collapse behavior, config-driven rerenders, and raw-file fallback so DOM regressions surface even when the underlying diff text is unchanged.

If the smoke surface grows substantially, a separate `tsconfig.smoke.json` would be a good next step. Until then, the current JavaScript setup keeps the workflow simple.
