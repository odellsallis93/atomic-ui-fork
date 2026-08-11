# @bastani/atomic-gui

Electron desktop host for Atomic. Speaks the interactive-engine JSONL protocol
(v2) so the agent loop, extensions, tools, and sessions stay in the `atomic`
engine child — this package replaces only the terminal compositor.

See [`specs/2026-08-08-electron-gui-plan.md`](../../specs/2026-08-08-electron-gui-plan.md)
for the full parity plan and milestone map. Continuation plan:
[`specs/2026-08-11-gui-parity-continuation-plan.md`](../../specs/2026-08-11-gui-parity-continuation-plan.md).
User-facing status table: [`packages/coding-agent/docs/gui.md`](../coding-agent/docs/gui.md).

**Capability ledger (parity evidence):** [`docs/capability-ledger.md`](docs/capability-ledger.md).
Fake-engine unit tests prove host structure only; parity claims require
`real-engine` or `e2e` rows in the ledger.

## Status (summary)

| Milestone | Coverage |
|---|---|
| M0 | Done — engine bridge, IPC, event log |
| M1 | Mostly done — core transcript kinds, footer/usage, working indicator |
| M2 | Mostly done — composer, `/` + `@`, bash, queue/steer/abort (attachments, full keymap still open) |
| M3 | Mostly done — resume picker, tree folds/labels/edit-resubmit, clone/fork/import/export/compact. Share and legacy `/import`/`/atomic` remain explicit exclusions: no permitted runtime inventory route. |
| M4 | Partial — model picker parses scoped engine models, thinking/settings controls use existing RPCs, theme loading follows JSON-name first-match precedence, auth/trust/onboarding route through engine-owned flows. Persistent settings/theme/fast-mode mutation remains excluded until protocol v2 adds RPCs. |
| M5 | Partial — dialogs, input forms, ANSI frames + render loop + overlay geometry + kitty key-release + terminal-mode allowlist (chrome swap blocked on §5.3) |
| M6 | Partial — web-access uses the engine-discovered command/shortcut catalog and generic dialogs: `/websearch`, `/curator`, and `/search`. The curator remains the extension-owned browser/Glimpse surface; provider config, cookies, stored-result RPCs, and secrets are excluded. |
| M7 | Not started — CI jobs, packaging |

## Develop

From the monorepo root (after `npm ci --ignore-scripts`):

```sh
# Electron’s binary is skipped by --ignore-scripts; run once after install:
node node_modules/electron/install.js

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
npm run build --workspace=@bastani/atomic-gui
```

`test/engine-client.test.ts` uses a **fake** engine child (RPC shape only).
`test/real-engine-smoke.test.ts` spawns the real workspace CLI for lifecycle smoke.


## Phase 3 settings/theme boundary

- The GUI does **not** write generic `settings.json` or credentials. It reads the effective theme with engine global→project precedence and applies theme changes live for the renderer session only.
- Settings controls available in the panel call existing engine RPCs: thinking level, steering/follow-up mode, auto compaction, and auto retry.
- Codex fast mode is not exposed: engine settings accessors exist, but protocol v2 has no fast-mode RPC.
- Themes resolve by JSON `name` with first-match builtin → user (`.atomic`, then legacy `.pi`) → project (`.atomic`, then `.pi`) order and support string plus numeric color tokens.
- First-run onboarding links to project trust, provider auth, and model selection without displaying saved secrets.

## Notes

- Private workspace package — not published to npm and not bundled into `@bastani/atomic`.
- Has its own electron-vite build (exception to the raw-TypeScript companion-package rule).
- Renderer is sandboxed (`contextIsolation`, no `nodeIntegration`); privileged work is main-process only.
