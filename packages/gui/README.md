# @bastani/atomic-gui

Electron desktop host for Atomic. Speaks the interactive-engine JSONL protocol
(v2) so the agent loop, extensions, tools, and sessions stay in the `atomic`
engine child — this package replaces only the terminal compositor.

See [`specs/2026-08-08-electron-gui-plan.md`](../../specs/2026-08-08-electron-gui-plan.md)
for the full parity plan and milestone map.

## Status

Milestone coverage in this package:

- **M0** — window shell, engine spawn + protocol handshake, typed IPC, raw event log
- **M1 (partial)** — transcript for user/assistant/tool/compaction, working indicator, footer
- **M2 (partial)** — CodeMirror composer, Enter/Alt+Enter/Escape, queue chips, bash-mode border

Later milestones (sessions, settings/theme/auth, full `ctx.ui.*` frame surface,
bundled-extension parity, packaging) are not done yet.

## Develop

From the monorepo root (after `npm ci --ignore-scripts`):

```sh
npm install --workspace=@bastani/atomic-gui
npm run dev --workspace=@bastani/atomic-gui
```

The host resolves the engine CLI as:

1. `ATOMIC_GUI_CLI` — compiled `atomic` binary
2. `ATOMIC_GUI_CLI_ENTRY` (+ optional `ATOMIC_GUI_RUNTIME`)
3. `packages/coding-agent/dist/cli.js` under Node
4. `packages/coding-agent/src/cli.ts` under Bun
5. `atomic` on `PATH`

## Test / typecheck

```sh
npm run test --workspace=@bastani/atomic-gui
npm run typecheck --workspace=@bastani/atomic-gui
```

## Notes

- Private workspace package — not published to npm and not bundled into `@bastani/atomic`.
- Has its own electron-vite build (exception to the raw-TypeScript companion-package rule).
- Renderer is sandboxed (`contextIsolation`, no `nodeIntegration`); privileged work is main-process only.
