# @bastani/atomic-gui

Electron desktop host for Atomic. Speaks the interactive-engine JSONL protocol
(v2) so the agent loop, extensions, tools, and sessions stay in the `atomic`
engine child — this package replaces only the terminal compositor.

See [`specs/2026-08-08-electron-gui-plan.md`](../../specs/2026-08-08-electron-gui-plan.md)
for the full parity plan and milestone map.

## Status

Milestone coverage in this package:

- **M0** — window shell, engine spawn + protocol handshake, typed IPC, raw event log
- **M1** — transcript for user/assistant/tool/bash/compaction, thinking toggle, footer + usage
- **M2** — CodeMirror composer, `/` + `@` autocomplete, history, `!`/`!!` bash, queue chips
- **M3 (partial)** — host-side resume picker, new/switch session
- **M4 (partial)** — model picker + cycle model/thinking
- **M5 (partial)** — native dialogs, notify toasts, status segments, widgets

Still open: full settings/theme/auth, ANSI `ctx.ui.custom()` frame surface, bundled-extension
parity walkthroughs, packaging/CI topology jobs.

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
