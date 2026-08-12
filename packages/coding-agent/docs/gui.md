# Atomic GUI (Electron)

Atomic ships an optional desktop GUI host in the monorepo package
`@bastani/atomic-gui` (`packages/gui`). It is **not** published inside the
`@bastani/atomic` npm package.

## What it is

A new *host* for the existing interactive-engine child. The GUI speaks the same
JSONL protocol the terminal host uses (`INTERACTIVE_ENGINE_PROTOCOL_VERSION = 3`):
RPC commands for prompts/abort/session control plus `engine_*` frames for
extension UI. The agent loop, extensions, tools, sessions, and models stay in
the engine child.

The v3 handshake identifies Electron as `hostInfo.kind = "gui"`, while extension
`ctx.mode` stays `"tui"` so existing UI-capable extensions continue to work unchanged.
Extensions can opt into GUI behavior through `ctx.ui.hostInfo`.

## Current milestone status

| Milestone | Status |
|---|---|
| M0 Skeleton + engine bridge | Done |
| M1 Core chat parity | Mostly done — active-leaf-only durable transcript hydration, virtualized variable-height long transcripts with bottom-only auto-follow, user/assistant/custom/skill/system/branch/compaction/tool/bash handling, thinking toggle, safe raster image attachments, escaped unified-diff tool output, footer + usage meter, working indicator, and engine-rendered live/durable tool cards. The host reads engine-owned JSONL through `get_entries` and follows its `leafId`/`parentId` path; it does not treat history order as the active transcript. A real-engine durable transcript corpus plus 10,000-row window coverage now complement renderer tests; extension-owned custom renderers and the Electron long-scroll/provider walkthrough remain open |
| M2 Input system | Mostly done — CodeMirror composer with configurable submit/newline bindings, cancellable engine-evaluated `/` command/arguments/path/`@` autocomplete (including extension provider wrappers), engine-resolved external editor, history, `!`/`!!` bash, steer/follow-up/abort, queue chips |
| M3 Sessions | Mostly done — resume picker (search/sort/all-projects), persisted transcript hydration on start/switch/tree navigation, rename/delete, clone/fork/import/export/**share**/compact, and tree folds/labels/edit-resubmit. Durable import/list/resume/new-session/active-delete replacement, user-node tree navigation with draft restoration, fork/rename/delete/export/clone, and extension-backed compaction have real-engine coverage; `share_session` keeps the GitHub CLI credential flow engine-owned and requires credentialed manual desktop acceptance. Legacy composer `/import` or `/atomic` remain excluded because runtime `get_commands` inventories extension/prompt/skill commands only. |
| M4 Models / settings | Partial — model picker, cycle model/thinking, an engine-validated scoped-model editor that persists and immediately applies the `ctrl+p` model cycle, engine-owned resolved theme snapshot + validated built-in/custom theme mutation and reload, validated operation-based settings mutation for default thinking visibility, queue/compaction/retry/fast-mode controls, typed settings reload that returns only the effective snapshot, engine-owned project-trust status/options/mutation, and an engine-derived API-key/OAuth/logout capability catalog for provider auth. The GUI never infers a login method or sees credentials; real-provider and first-run desktop acceptance plus broader settings coverage remain open. |
| M5 Extension UI host | Partial — native dialogs/notify/status/widgets, extension shortcut dispatch, `engine_input_form_*`, `hostSessionPicker` (`engine_session_picker_*`), ANSI frame overlays with render loop + `overlayOptions` + control/invalidate + legacy key encoding + kitty key-release + mouse-scroll wheel + autowrap terminal mode; remote custom header/footer/editor slots, native composer text mirrored for synchronous `ctx.ui.getEditorText`, engine-owned theme accessors with named selections resolved back through the host CSS snapshot, engine-dispatched autocomplete providers, ordered terminal-input interception, and transcript-local engine tool renderer frames. Real-engine extension coverage verifies confirm/select/input/editor response round-trips, confirm and editor timeout defaults, host input-form submit and session-picker selection, custom-overlay and header/footer/editor-chrome render lifecycles, ordered terminal-input transform/consume behavior, title/widget/status, `setEditorText`, mirrored `getEditorText`, theme accessors and named-theme forwarding, and `hostInfo.kind = gui` while `ctx.mode` remains `tui`; browser-level extension acceptance remains open. |
| M6 | Partial — Workflows has a scripted Electron renderer-host walkthrough: Composer sends generic `/workflow …` prompts for dispatch/list/status/attach, runtime F2 opens the generic custom-frame graph, and generic input-form/session-picker/dialog/widget routes cover its host surfaces. This is fixture evidence only; no workflow RPC, GUI-only renderer, live DBOS workflow proof, or other bundled-extension walkthrough is claimed. |

| M7 Release readiness | Partial — Phase 5.1 adds changed-path Linux x64 GUI CI; Phase 5.2/5.3 adds host-platform directory packaging/startup smoke and a source-backed security review; Phase 5.4/5.5 adds focused accessibility and renderer-budget evidence. Signed DMG/NSIS/AppImage installers, packaging CI, updates, provider/network behavior, cross-platform behavior, and screen-reader validation remain open or unproven. |

## Supported scope and GUI-vs-CLI boundary

The GUI is an optional Electron host for the existing interactive-engine child.
Protocol v3 remains the boundary: the engine owns the agent loop, extensions,
tools, sessions, models, configuration, and their semantics; the GUI replaces
the terminal compositor. It does not add a GUI-only engine protocol or a second
configuration authority.

This release-readiness slice validates **Linux x64 only** for its CI and makes no
macOS or Windows support claim, even though the private package manifest lists
desktop targets. Host-platform directory packaging and startup smoke, source
security review, named-control/modal keyboard checks, and renderer budget probes
are separate evidence. They do not cover signed installers, packaging CI,
updates, provider/network behavior, screen-reader certification, or packaged-app
performance.

The terminal CLI remains the primary interface. Keep machine interfaces
(`--print`, JSON/RPC modes, and pipes), launch flags, package administration,
credential-print commands, and multi-window or remote deployment in the CLI or
their existing exclusions. The GUI must not invent routes for protocol-v2 gaps;
see the [capability ledger](../../gui/docs/capability-ledger.md) for evidence
and exclusions.

The authoritative plan lives at
[`specs/2026-08-08-electron-gui-plan.md`](../../../specs/2026-08-08-electron-gui-plan.md).

Workflow route inventory and exclusions: [`packages/gui/docs/workflow-walkthrough.md`](../../gui/docs/workflow-walkthrough.md).

Packaging/security evidence: [`packages/gui/docs/packaging-security.md`](../../gui/docs/packaging-security.md)
records the host-platform directory smoke, its 26-file / 134-test security-gate
receipt, source review, and exact installer/update/platform limits.

Accessibility/performance evidence: [`packages/gui/docs/capability-ledger.md`](../../gui/docs/capability-ledger.md)
records the focused named-control, modal-label, Tab/Escape/focus-return checks
and the renderer budgets.

## Running locally

```sh
# From the monorepo root:
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run build --workspace=@bastani/atomic-natives
npm run dev --workspace=@bastani/atomic-gui
```

`npm ci --ignore-scripts` skips Electron's postinstall, so the explicit
`install.js` step is required. The native binding build is needed by the
real-engine smoke when bundled extensions load.

## Phase 5.1 CI checks

`.github/workflows/gui.yml` is a separate changed-path workflow. On pull
requests it runs for GUI, engine-host, native-binding, manifest, or lockfile
changes; pushes run only on `main`. It leaves the required root checks in
`.github/workflows/test.yml` unchanged and runs only on a Linux x64 Blacksmith
runner.

The focused checks are:

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run build --workspace=@bastani/atomic-natives
xvfb-run --auto-servernum npm run test:gui
npm run typecheck:gui
npm run build --workspace=@bastani/atomic-gui
```

The workflow installs Electron's Linux runtime libraries and `xvfb` before
launching the Playwright Electron fixture. It uses no secrets. This is test,
typecheck, and build coverage only; it is not packaging or release coverage.

## Phase 5 evidence and recovery

On 2026-08-11, the Phase 5 checks passed the native binding build,
`npm run test:gui` (25 files, 127 tests), GUI typecheck, and GUI build. The test
result includes six real-engine lifecycle/session smoke tests and 13
deterministic Electron renderer-host tests. The renderer-host tests use a
protocol-shaped fixture, not a live provider; the evidence does not claim
provider, packaging, or macOS/Windows parity. The remote Linux workflow result
is the CI gate.

### Phase 5.4/5.5 accessibility and performance evidence

The focused accessibility checks cover named controls and modal labels, keyboard
Tab trapping, Escape dismissal, and focus return to the opener through
`test/autocomplete-accessibility.test.tsx`, `test/dialog-modal.test.tsx`, and
the keyboard-only Electron case in `test/electron-phase2.e2e.test.ts`. They
prove DOM and keyboard behavior, not screen-reader certification or an
OS-specific accessibility stack.

The focused renderer checks in `test/performance-budget.test.tsx` cover 10,000
transcript rows in ≤1500ms with fewer than 40 mounted rows, plus 120 tool-stream
deltas in ≤2500ms. `test/transcript-virtualization.test.tsx` covers live-region
and disclosure semantics. These are renderer/jsdom probes, not provider/network,
cross-platform, or packaged-app performance claims.

The CI receipt above remains the historical **25 files / 127 tests** gate. The
packaging/security receipt remains the separate **26 files / 134 tests** run.
After merged full-gate verification, the integrated GUI suite passed with **29
files / 141 tests**. This count does not add provider/network, cross-platform,
screen-reader, or packaged-app claims.

To recover a failed local check, repeat `npm ci --ignore-scripts`, run
`node node_modules/electron/install.js`, rebuild
`@bastani/atomic-natives`, then run the three GUI checks in order. On headless
Linux, prefix the test command with `xvfb-run --auto-servernum`. If the engine
does not reach ready, verify `ATOMIC_GUI_CLI` or `ATOMIC_GUI_CLI_ENTRY`, the
protocol-v2 version, and the native binding. Do not add credentials or a live
model to CI while recovering this gate.

Point the host at a specific Atomic CLI if needed:

```sh
ATOMIC_GUI_CLI=/path/to/atomic npm run dev --workspace=@bastani/atomic-gui
# or
ATOMIC_GUI_CLI_ENTRY=packages/coding-agent/src/cli.ts ATOMIC_GUI_RUNTIME=bun \
  npm run dev --workspace=@bastani/atomic-gui
```

## Useful shortcuts (focused window)

| Shortcut | Action |
|---|---|
| Enter | Send (or steer while streaming) |
| Alt+Enter | Follow-up while streaming |
| Escape | Abort (or dismiss focused extension frame) |
| Ctrl+L | Open model picker |
| Ctrl+P | Cycle model |
| Ctrl+, | Open settings / theme picker |
| Ctrl+Shift+A | Open provider auth panel |
| Shift+Tab | Cycle thinking level |
| Ctrl+T | Hide/show thinking blocks |
| Ctrl+O | Expand/collapse latest tool card |
| `/…` / `@…` | Slash-command (including dynamic argument) and file mention autocomplete |
| `!` / `!!` | Bash (in-context / excluded) |

## Sessions

The Sessions modal lists JSONL sessions under `~/.atomic/agent/sessions/` through the
engine's `list_sessions` RPC while it is running, with a host-side fallback before the
engine starts. From there you can:

- Resume / new session / rename / delete
- Clone the current leaf (`clone` RPC), fork from an engine-supplied user message (`get_fork_messages` → `fork`), import JSONL (`import_session`), export HTML (`export_html`), and share through the engine-owned `share_session` GitHub CLI flow
- Open **Tree** for `get_tree` / `navigate_tree`; local folds do not change the engine tree, while labels use `set_label` and selecting a user turn restores engine-supplied editor text for edit/resubmit
- **Excluded:** legacy `/import` and `/atomic` do not appear in runtime `get_commands`, so the GUI does not invent composer routes

## Themes

Settings receives the engine's resolved theme snapshot and global/project
precedence metadata. Selecting a theme is validated and persisted by the
engine's typed `set_theme` RPC; Electron receives only the resolved CSS tokens,
never settings/theme paths. The supported GUI queue, compaction, retry, and
fast-mode controls use typed `update_settings` operations; arbitrary settings
documents and paths remain private to the engine. Builtin themes ship with `@bastani/atomic`; user themes load
through the engine resource system.

## Auth and trust

- **Auth** panel lists providers from `get_available_models` (including
  `oauthProviders`) and runs `login_provider` / `logout_provider`. API-key login
  uses `engine_input_form_*`; OAuth uses the `oauth_*` extension UI channel.
- **Trust** is queried and mutated through typed engine RPCs backed by Atomic's
  existing trust store. Before the main engine starts, the GUI uses an isolated
  `--no-approve` engine probe so untrusted project resources stay unloaded;
  Electron never reads or writes `trust.json`. Session-only choices are retained
  only as the typed launch override for that GUI engine.

## Extension frames

Custom extension UIs (`ctx.ui.custom`) arrive as `engine_custom_*` messages.
The host:

1. Opens a frame on `engine_custom_open` (persisting `overlayOptions` / `handlesCtrlC`)
2. Sends `engine_custom_render` with a measured cell grid
3. Paints `engine_custom_frame` lines as ANSI-styled React text segments
4. Forwards keyboard (and optional mouse-scroll) as `engine_custom_input`, then
   pipelines another render request
5. Honors `engine_custom_invalidate` and `engine_custom_control` (hide/show/focus)
6. Applies allowlisted `engine_custom_terminal` modes (mouse-scroll tracking, autowrap)

`ctx.ui.hostSessionPicker` uses `engine_session_picker_*` messages; the GUI mounts a
native searchable list and sends `engine_session_picker_select/cancel/delete`.

`ctx.ui.setFooter`, `ctx.ui.setHeader`, and `ctx.ui.setEditorComponent` render through
remote ANSI chrome slots. A custom editor receives raw terminal-style key input and submits
through the active engine session.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer
- Preload exposes a narrow typed `window.atomicGui` API over `contextBridge`
- Provider credentials stay in the engine-owned auth flow; the GUI does not read, persist, or pass API keys through its bootstrap path. The bootstrap file carries only private engine lifecycle coordination (host PID and guard file).
- ANSI frames are parsed into styled React text spans; no raw frame HTML is inserted

## Relation to the TUI

The terminal UI remains the primary interface. The GUI is an additional host
with the same configuration surface (`~/.atomic/agent/`, project `.atomic/`).
Capability gaps found while building the GUI are closed in the engine protocol
so both hosts benefit.
