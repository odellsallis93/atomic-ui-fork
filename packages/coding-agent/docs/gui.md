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
| M1 Core chat parity | Mostly done — user/assistant/tool/bash/compaction, thinking toggle, footer + usage meter, working indicator |
| M2 Input system | Mostly done — CodeMirror composer, `/` command and command-argument + `@` autocomplete, history, `!`/`!!` bash, steer/follow-up/abort, queue chips |
| M3 Sessions | Mostly done — resume picker (search/sort/all-projects), persisted transcript hydration on start/switch/tree navigation, rename/delete, clone, export HTML, compact, session tree navigator (`list_sessions` still host-local per plan §5.1) |
| M4 Models / settings | Partial — model picker, cycle model/thinking, theme loader, provider login/logout + OAuth UI, project trust prompt (full onboarding still open) |
| M5 Extension UI host | Partial — native dialogs/notify/status/widgets, extension shortcut dispatch, `engine_input_form_*`, `hostSessionPicker` (`engine_session_picker_*`), ANSI frame overlays with render loop + `overlayOptions` + control/invalidate + legacy key encoding + kitty key-release + mouse-scroll wheel + autowrap terminal mode; remote custom header/footer slots (custom editor swap still blocked under isolation) |
| M6–M7 | Not started |

The authoritative plan lives at
[`specs/2026-08-08-electron-gui-plan.md`](../../../specs/2026-08-08-electron-gui-plan.md).

## Running locally

```sh
# After `npm ci --ignore-scripts`, download the Electron binary once:
node node_modules/electron/install.js

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

The Sessions modal lists JSONL sessions under `~/.atomic/agent/sessions/`
(host-side until engine `list_sessions` lands). From there you can:

- Search, sort (modified/created/name/messages), and toggle all-projects
- Resume / new session / rename / delete
- Clone the current leaf (`clone` RPC) and export HTML (`export_html` RPC)
- Open **Tree** for `get_tree` / `navigate_tree`

## Themes

Settings writes `theme` into `~/.atomic/agent/settings.json` and applies Atomic
theme JSON tokens as CSS custom properties (`--atomic-*`, plus a few shell
aliases). Builtin themes ship with `@bastani/atomic`; user themes load from
`~/.atomic/agent/themes/`.

## Auth and trust

- **Auth** panel lists providers from `get_available_models` (including
  `oauthProviders`) and runs `login_provider` / `logout_provider`. API-key login
  uses `engine_input_form_*`; OAuth uses the `oauth_*` extension UI channel.
- **Trust** prompts before engine start when the cwd has project resources and
  `~/.atomic/agent/trust.json` has no decision, matching TUI trust options
  (including session-only).

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

`ctx.ui.setFooter` and `ctx.ui.setHeader` render their components into remote ANSI
chrome slots. `setEditorComponent` remains unsupported under interactive-engine isolation:
it needs additional submit/focus plumbing so custom editors retain the native composer's
session semantics.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer
- Preload exposes a narrow typed `window.atomicGui` API over `contextBridge`
- Engine credentials (when supplied) travel through the interactive-engine
  bootstrap file, never argv/env of descendant processes
- ANSI frames are parsed into styled React text spans; no raw frame HTML is inserted

## Relation to the TUI

The terminal UI remains the primary interface. The GUI is an additional host
with the same configuration surface (`~/.atomic/agent/`, project `.atomic/`).
Capability gaps found while building the GUI are closed in the engine protocol
so both hosts benefit.
