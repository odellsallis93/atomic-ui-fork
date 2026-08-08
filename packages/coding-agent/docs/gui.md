# Atomic GUI (Electron)

Atomic ships an optional desktop GUI host in the monorepo package
`@bastani/atomic-gui` (`packages/gui`). It is **not** published inside the
`@bastani/atomic` npm package.

## What it is

A new *host* for the existing interactive-engine child. The GUI speaks the same
JSONL protocol the terminal host uses (`INTERACTIVE_ENGINE_PROTOCOL_VERSION = 2`):
RPC commands for prompts/abort/session control plus `engine_*` frames for
extension UI. The agent loop, extensions, tools, sessions, and models stay in
the engine child.

## Current milestone status

| Milestone | Status |
|---|---|
| M0 Skeleton + engine bridge | Done |
| M1 Core chat parity | Partial (user/assistant/tool/compaction, footer, working indicator) |
| M2 Input system | Partial (CodeMirror composer, steer/follow-up/abort, queue chips, bash-mode border) |
| M3–M7 | Not started |

The authoritative plan lives at
[`specs/2026-08-08-electron-gui-plan.md`](../../../specs/2026-08-08-electron-gui-plan.md).

## Running locally

```sh
npm install --workspace=@bastani/atomic-gui
npm run dev --workspace=@bastani/atomic-gui
```

Point the host at a specific Atomic CLI if needed:

```sh
ATOMIC_GUI_CLI=/path/to/atomic npm run dev --workspace=@bastani/atomic-gui
# or
ATOMIC_GUI_CLI_ENTRY=packages/coding-agent/src/cli.ts ATOMIC_GUI_RUNTIME=bun \
  npm run dev --workspace=@bastani/atomic-gui
```

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer
- Preload exposes a narrow typed `window.atomicGui` API over `contextBridge`
- Engine credentials (when supplied) travel through the interactive-engine
  bootstrap file, never argv/env of descendant processes

## Relation to the TUI

The terminal UI remains the primary interface. The GUI is an additional host
with the same configuration surface (`~/.atomic/agent/`, project `.atomic/`).
Capability gaps found while building the GUI are closed in the engine protocol
so both hosts benefit.
