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
| M6 | Partial — Workflows, subagents, and Intercom walkthroughs are renderer-host E2E-proven through generic prompt/form/session-picker/custom-frame/widget routes; MCP panels and proxy/direct tool rendering use the same generic host contracts; web-access uses the engine-discovered command/shortcut catalog and generic dialogs for `/websearch`, `/curator`, and `/search`. Live workflow/DBOS, subagent job controls, Intercom broker/peer, configured MCP OAuth/calls, curator browser/Glimpse, provider config, cookies, stored-result RPCs, secrets, and packaging remain open or excluded by protocol v2. |
| M7 | Partial — Phase 5.1 Linux GUI CI and Phase 5.6 docs are done; packaging, security, accessibility, and performance remain open. |

## Supported scope and host boundary

This package is an optional Electron host for Atomic's interactive engine. The
engine remains the authority for the agent loop, extensions, tools, sessions,
models, configuration, and protocol semantics. The GUI replaces the terminal
compositor; it does not fork CLI behavior or add a second configuration system.

This Phase 5 slice has **Linux x64 CI coverage only**. The Electron manifest
contains macOS and Windows targets, but this workflow does not test or promise
support for those operating systems. No packaging, signing, update, security,
accessibility, or performance gate is included here.

The GUI supports interactive engine-host flows covered by the linked ledger and
walkthroughs. CLI machine interfaces (`--print`, JSON/RPC modes, and pipes),
launch flags, package administration, credential-print commands, and
multi-window or remote deployment remain CLI-owned or excluded. Do not use the
GUI as a replacement for CLI automation.

## Phase 5.1 CI

`.github/workflows/gui.yml` is a separate changed-path workflow. It runs on
Linux x64 for GUI, engine-host, native-binding, manifest, or lockfile changes,
without changing the required contexts in `.github/workflows/test.yml`.

The CI sequence is:

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run build --workspace=@bastani/atomic-natives
xvfb-run --auto-servernum npm run test:gui
npm run typecheck:gui
npm run build --workspace=@bastani/atomic-gui
```

`npm ci --ignore-scripts` is required by the repository. The explicit Electron
install restores the binary skipped by that command; the native build supports
the real-engine smoke, and `xvfb-run` supplies the Linux display used by the
Playwright Electron fixture. The workflow installs the Linux runtime packages
it needs and uses no secrets.

## Phase 5 evidence (2026-08-11)

After the Phase 5 checks on 2026-08-11, the native binding build,
`npm run test:gui` (25 files, 127 tests), GUI typecheck, and GUI build all
passed locally. The suite includes six real-engine lifecycle/session smoke tests
and 13 deterministic Electron renderer-host tests; it does not claim live
provider, packaging, or cross-platform parity. The remote Linux workflow is the
CI gate; no macOS or Windows result is claimed by this slice.

## Recovery

If a GUI check fails after dependency installation, rerun the setup in order:

1. `npm ci --ignore-scripts`
2. `node node_modules/electron/install.js`
3. `npm run build --workspace=@bastani/atomic-natives`
4. `npm run test:gui`, then `npm run typecheck:gui` and the GUI build

For a headless Linux run, wrap the test command with
`xvfb-run --auto-servernum`. If the engine cannot start, check the resolved
CLI (`ATOMIC_GUI_CLI` or `ATOMIC_GUI_CLI_ENTRY`), the protocol-v2 version, and
the native binding before changing GUI code. Do not add provider credentials to
CI or use a live model to recover this gate.

## Develop

From the monorepo root (after `npm ci --ignore-scripts`):

```sh
# Electron’s binary is skipped by --ignore-scripts; run once after install:
node node_modules/electron/install.js
npm run build --workspace=@bastani/atomic-natives
npm run dev --workspace=@bastani/atomic-gui
```

The host resolves the engine CLI as:

1. `ATOMIC_GUI_CLI` — compiled `atomic` binary
2. `ATOMIC_GUI_CLI_ENTRY` (+ optional `ATOMIC_GUI_RUNTIME`)
3. `packages/coding-agent/dist/cli.js` under Node
4. `packages/coding-agent/src/cli.ts` under Bun
5. `atomic` on `PATH`

## Test / typecheck

`real-engine-smoke.test.ts` loads bundled extensions. After an
`npm ci --ignore-scripts`, build the local native binding before GUI checks:

```sh
npm run build --workspace=@bastani/atomic-natives
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

## Phase 4 Workflows boundary

[`docs/workflow-walkthrough.md`](docs/workflow-walkthrough.md) records the generic `/workflow …` and F2 routes, fixture evidence, source inventory, and exact exclusions. The GUI does not add workflow RPCs or a workflow-specific renderer.

## Phase 4 Subagents boundary

[`docs/subagents-walkthrough.md`](docs/subagents-walkthrough.md) records the generic below-editor widget route, fixture evidence, source inventory, and exact exclusions. The GUI does not add subagent RPCs, per-job controls, or a subagent-specific renderer.

## Phase 4 Intercom boundary

`/intercom` uses the engine-owned command and generic custom frames; a visible durable `intercom_message` renders in the generic transcript. The GUI has no direct Intercom RPC, broker, peer, group, attachment, or tool-action controls. See the source-backed inventory and exact exclusions in [`docs/capability-ledger.md`](docs/capability-ledger.md).

## Phase 4 MCP boundary

- `/mcp`, `/mcp setup`, and `/mcp-auth` expose only the existing generic custom-frame contract. The renderer has no MCP-specific IPC or extension fork.
- MCP tools, including direct tools only when the runtime exposes them, arrive as generic `tool_execution_*` events and render through the engine-owned tool frame path.
- MCP OAuth stays in the engine browser/callback flow. Ctrl+C reaches the MCP panel, which cancels its scoped engine-owned OAuth owner before close. The GUI never reads, logs, writes, or returns credentials or tokens.
- Protocol v2 exposes no MCP server config, connection, token, or auth-state RPC. Those surfaces remain excluded from GUI authority.

## Notes

- Private workspace package — not published to npm and not bundled into `@bastani/atomic`.
- Has its own electron-vite build (exception to the raw-TypeScript companion-package rule).
- Renderer is sandboxed (`contextIsolation`, no `nodeIntegration`); privileged work is main-process only.
