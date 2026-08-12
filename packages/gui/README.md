# @bastani/atomic-gui

Electron desktop host for Atomic. Speaks the interactive-engine JSONL protocol
(v3) so the agent loop, extensions, tools, and sessions stay in the `atomic`
engine child — this package replaces only the terminal compositor.

See [`specs/2026-08-08-electron-gui-plan.md`](../../specs/2026-08-08-electron-gui-plan.md)
for the full parity plan and milestone map.
User-facing status table: [`packages/coding-agent/docs/gui.md`](../coding-agent/docs/gui.md).

**Capability ledger (parity evidence):** [`docs/capability-ledger.md`](docs/capability-ledger.md).
Fake-engine unit tests prove host structure only; parity claims require
`real-engine` or `e2e` rows in the ledger.

## Status (summary)

| Milestone | Coverage |
|---|---|
| M0 | Done — engine bridge, IPC, event log |
| M1 | Mostly done — core transcript kinds, footer/usage, working indicator; real-engine durable transcript corpus coverage now complements renderer tests |
| M2 | Mostly done — composer with configurable submit/newline bindings, empty-editor Up/Down prompt history, cancellable engine-evaluated `/` + `@`/path autocomplete (including extension providers), bash, queue/steer/abort (attachments and desktop keymap acceptance still open) |
| M3 | Mostly done — resume picker, tree folds/labels/edit-resubmit, clone/fork/import/export/share/compact. Durable import/list/resume/new-session/active-delete replacement/fork/rename/delete/export/clone and extension-backed compaction are real-engine covered; credentialed share still needs a manual desktop check. Legacy `/import`/`/atomic` remain explicit exclusions: no permitted runtime inventory route. |
| M4 | Partial — model picker parses scoped engine models; typed engine settings cover model-cycle scope, theme, thinking, queues, compaction/retry, Codex fast mode, and project trust without exposing settings or trust-store files to Electron. The Settings panel can reload effective settings, apply the resolved theme live, and persist its supported controls through validated engine settings operations. Auth actions are derived from engine-reported API-key/OAuth/logout capabilities, never from credentials; real-provider and first-run desktop acceptance plus broader settings coverage remain open. |
| M5 | Partial — dialogs, input forms, ANSI frames + render loop + overlay geometry + kitty key-release + terminal-mode allowlist, native-composer text mirrored for synchronous `ctx.ui.getEditorText`, engine-owned extension theme accessors, engine-dispatched autocomplete providers, and ordered terminal input interception. Real-engine extension coverage proves custom overlay and header/footer/editor chrome render paths, title/widget/status, `setEditorText`, mirrored `getEditorText`, engine theme accessors, and `hostInfo.kind = gui` while `ctx.mode` remains `tui`. Browser-level extension acceptance remains open. |
| M6 | Partial — Workflows, subagents, and Intercom walkthroughs are renderer-host E2E-proven through generic prompt/form/session-picker/custom-frame/widget routes; MCP panels and proxy/direct tool rendering use the same generic host contracts; web-access uses the engine-discovered command/shortcut catalog and generic dialogs for `/websearch`, `/curator`, and `/search`. Live workflow/DBOS, subagent job controls, Intercom broker/peer, configured MCP OAuth/calls, curator browser/Glimpse, provider config, cookies, stored-result RPCs, secrets, and other protocol exclusions remain open. |
| M7 | Partial — changed-path Linux x64 CI, host-platform directory packaging/startup smoke, source security review, and focused accessibility/performance evidence are documented. Signed DMG/NSIS/AppImage installers, packaging CI, and updates remain open or unproven. |

## Supported scope and host boundary

This package is an optional Electron host for Atomic's interactive engine. The
engine remains the authority for the agent loop, extensions, tools, sessions,
models, configuration, and protocol semantics. The GUI replaces the terminal
compositor; it does not fork CLI behavior or add a second configuration system.
The normal `atomic` TUI neither starts nor requires this package; its input loop
and extension contract remain the upstream-compatible default.
GUI windows use Atomic's normal durable session behavior unless explicitly
launched against a supplied session path; they do not force `--no-session`.

Protocol v3 identifies this host as `gui` while retaining `ctx.mode === "tui"`
for extension compatibility. Extensions can opt into GUI-specific behavior via
`ctx.ui.hostInfo`.

This Phase 5 slice has **Linux x64 CI coverage only**. The Electron manifest
contains macOS and Windows targets, but this workflow does not test or promise
support for those operating systems. Focused accessibility checks cover named
controls, modal labels, keyboard Tab/Escape behavior, and focus return; focused
renderer budgets cover the bounded transcript and tool-stream probes. These
checks do not claim screen-reader certification, provider/network behavior, or
packaged-app performance. Host-platform packaging smoke and the source-backed
security review are documented separately.

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
provider, installer, or cross-platform parity. Host-platform directory packaging
and the security review are documented separately. The remote Linux workflow is
the CI gate; no macOS or Windows result is claimed by this slice.

## Phase 5 accessibility/performance evidence (2026-08-11)

The focused checks are:

- `test/autocomplete-accessibility.test.tsx`, `test/dialog-modal.test.tsx`,
  and the keyboard-only case in `test/electron-phase2.e2e.test.ts` cover named
  controls, modal labels, Tab trapping, Escape dismissal, and focus return to
  the opener. The checks cover DOM and keyboard behavior; they do not certify a
  screen reader or an OS-specific accessibility stack.
- `test/performance-budget.test.tsx` checks 10,000 transcript rows in ≤1500ms
  with fewer than 40 mounted rows, and 120 tool-stream deltas in ≤2500ms.
  `test/transcript-virtualization.test.tsx` covers live-region and disclosure
  semantics. These are renderer/jsdom probes, not provider/network,
  cross-platform, or packaged-app performance claims.

The historical CI receipt above remains **25 files / 127 tests**. The separate
packaging/security receipt is recorded in
[`docs/packaging-security.md`](docs/packaging-security.md), including its
26-file / 134-test security-gate run. After the merged full-gate verification,
the integrated GUI suite passed with **29 files / 141 tests**; this count does
not add provider/network, cross-platform, screen-reader, or packaged-app claims.

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
`npm run pack --workspace=@bastani/atomic-gui` produces a host-platform
directory artifact and runs the packaged startup smoke. The explicit alias
`npm run pack:directory --workspace=@bastani/atomic-gui` runs the same check.
See [`docs/packaging-security.md`](docs/packaging-security.md) for the tested
platform, installer limits, source-backed security review, and remaining risks.

`test/engine-client.test.ts` uses a **fake** engine child (RPC shape only).
`test/real-engine-smoke.test.ts` spawns the real workspace CLI for lifecycle smoke.


## Phase 3 settings/theme boundary

- The GUI does **not** write generic `settings.json` or credentials. It receives an engine-owned resolved theme snapshot with global→project precedence; selecting a theme is validated and persisted by the engine, while Electron receives only CSS tokens.
- Settings controls available in the panel call validated engine operations: scoped model-cycle patterns, thinking level, default thinking visibility, steering/follow-up mode, auto compaction, auto retry, and Codex fast mode. The engine rejects unmatched patterns and immediately applies accepted scope to the active session; Electron cannot write raw configuration JSON. The external-editor action likewise asks the engine to resolve `externalEditor` before Electron launches it.
- Theme discovery, validation, live reload, and CSS-token resolution have no GUI filesystem fallback. The renderer receives only the engine’s name/source catalog and resolved tokens, including for custom themes.
- Codex fast mode is an engine-owned chat/workflow toggle. It is available from Settings only when the engine supports it; unsupported providers simply ignore the corresponding request tier.
- **Reload settings** asks the engine to re-read global/project configuration and then reapplies the returned resolved theme. Electron never receives a settings path or raw configuration document.
- Themes resolve by JSON `name` with engine resource precedence and support string plus numeric color tokens.
- First-run onboarding resolves project trust and starts the engine before it enables engine-owned provider auth and model selection; it never displays saved secrets.

For provider-, OS-, and credential-dependent checks that CI cannot safely run,
use the [desktop acceptance checklist](docs/desktop-acceptance.md). It also
contains the required standalone-TUI compatibility smoke.

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
