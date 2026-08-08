# Atomic Electron GUI — Implementation Plan

Status: **In progress** — M0 done; M1/M2 largely done; M3/M4/M5 dialogs+pickers started in `packages/gui`

## Summary

Build a desktop GUI for Atomic as an Electron application that replicates the interactive
terminal UI's full feature surface: streaming chat, tool rendering, the input system
(autocomplete, bash mode, attachments, queueing), session management (resume, tree, fork,
clone), model/settings/theming, and — critically — the complete extension UI host contract
(`ctx.ui.*`), so that bundled extensions (workflows, subagents, intercom, MCP, web-access)
and third-party extensions work unmodified.

The core architectural bet: **the GUI is a new *host* for the existing interactive-engine
child**, speaking the same JSONL protocol the terminal host speaks today
(`src/modes/interactive-engine/protocol.ts`, protocol v2). The agent loop, extensions,
tools, sessions, and models all stay in the engine child, untouched. The GUI replaces only
the pi-tui compositor layer.

## Goals

- Feature parity with the interactive TUI as inventoried below — a user who knows the TUI
  loses nothing by switching.
- Unmodified extensions keep working, including `ctx.ui.custom()` components, overlays,
  widgets, custom footers, and custom editors.
- Same configuration surface: `~/.atomic/agent/` settings, keybindings, themes, packages,
  project `.atomic/` — no parallel config system.
- Native-feeling desktop app: real scrollback, text selection, clickable paths/links,
  drag-and-drop attachments, OS notifications, multiple windows/tabs.

## Non-goals

- Replacing the TUI. The terminal remains the primary interface; the GUI is an additional
  host.
- A remote/web deployment. Electron-local only in this plan (the renderer/web split keeps
  the door open, but nothing here designs for it).
- Publishing the GUI inside `@bastani/atomic`. It is a separate app with its own
  distribution channel (see Repo placement).
- GUI-exclusive agent features. Any capability gap found during this work is closed in the
  engine protocol so both hosts benefit.

---

## 1. Feature inventory to replicate

Condensed from `docs/usage.md`, `docs/tui.md`, `docs/keybindings.md`, `docs/sessions.md`,
`docs/settings.md`, and `src/modes/interactive/`.

### 1.1 Shell chrome (four regions)

| TUI region | Source | GUI equivalent |
|---|---|---|
| Startup header (∀ identity, banner, announcements) | `startup-identity.ts`, `atomic-banner.ts` | Window chrome + first-render splash |
| Scrollable transcript | `chat-transcript.ts`, `chat-session-host.ts` | Virtualized message list |
| Editor slot (editor ⟷ selector/dialog swap) | `custom-editor.ts`, selector components | Composer panel with modal slot |
| Footer (model · thinking · cwd · git branch · session name; extension statuses) + usage meter (↑↓ R W CH tokens, context %, cost) | `footer.ts` | Persistent status bar |
| Working indicator (animated ∀ + whimsical verb; extension-overridable via `setWorkingIndicator`) | `atomic-working-status.ts` | Streaming indicator honoring extension frames |

### 1.2 Transcript entry kinds

From `chat-message-renderer.ts`: `user`, `assistant` (markdown + thinking blocks with
hide/show), `tool` (custom `renderCall`/`renderResult`, expand/collapse, diffs, images),
`bashExecution` (`!`/`!!`, streaming output, context-excluded dimming), `custom`
(extension entries and `registerEntryRenderer`), `branchSummary`, `compaction` boundary,
skill invocations, `system`.

### 1.3 Input system

- Slash-command autocomplete (builtin + extension + `/skill:` + prompt templates, plus
  argument completion), `@` fuzzy file mentions, Tab path completion
  (`interactive-autocomplete.ts`).
- Multiline editing, prompt history (Up/Down on empty editor).
- Bash mode: leading `!` (in-context) / `!!` (excluded), distinct border color, streaming
  output entry, abort.
- Attachments: image paste, drag-and-drop, large-paste collapse to `[paste #N]` markers
  expanded on submit.
- External editor (`ctrl+g` → `$VISUAL`/`$EDITOR`).
- Queueing while streaming: Enter = steer, Alt+Enter = follow-up, Alt+Up dequeue,
  Escape/Ctrl+C abort semantics, queue-pause behavior.
- Extension-swappable editor (`ctx.ui.setEditorComponent`) — see §3.4.

### 1.4 Slash commands and the UIs they open

`/settings`, `/model` (+`ctrl+l`), `/scoped-models`, `/fast`, `/resume`, `/new`, `/name`,
`/session`, `/tree`, `/fork`, `/clone`, `/compact`, `/copy`, `/export`, `/import`,
`/share`, `/login`, `/logout`, `/trust`, `/reload`, `/hotkeys`, `/changelog`, `/atomic`,
`/exit` — plus bundled-extension commands (`/workflow …`, `/run`, `/parallel`, `/mcp`,
`/intercom`, `/search`, …), skills, and prompt templates. Sources:
`src/core/slash-commands.ts`, `interactive-slash-commands.ts`.

### 1.5 Keybindings

All `app.*` actions from `src/core/keybindings.ts` (interrupt, clear/exit, thinking cycle
`shift+tab`, model cycle `ctrl+p`, model select `ctrl+l`, tools expand `ctrl+o`, thinking
toggle `ctrl+t`, external editor `ctrl+g`, follow-up `alt+enter`, dequeue `alt+up`, copy
`ctrl+x`, paste image `ctrl+v`, session-picker and tree-navigation keys), user overrides
from `~/.atomic/agent/keybindings.json`, and extension shortcuts (`registerShortcut`,
e.g. workflows' F2, intercom's ALT+M).

### 1.6 Sessions

Resume picker (search, sort modes, named filter, rename, delete with confirm, progressive
load), `/tree` navigator (filters, fold/unfold, labels, edit-and-resubmit on user node,
branch summaries), fork, clone, naming, HTML/JSONL export, gist share, verbatim compaction
(manual + auto, boundary rendering).

### 1.7 Models, settings, theming, auth

Model selector with search; scoped-models editor (enable/reorder the `ctrl+p` cycle);
thinking levels; Codex fast mode; the full `/settings` tree; theme system (built-ins +
`~/.atomic/agent/themes` + `.atomic/themes`, live reload); `/login` OAuth + API-key flows,
`/logout`, project trust.

### 1.8 Extension UI host contract (`ctx.ui.*`)

The complete interface in `src/core/extensions/ui-types.ts`:

- Dialogs: `select`, `confirm`, `input`, `editor` (with `timeout` countdown + `signal`).
- Fire-and-forget: `notify`, `setStatus`, `setWidget` (above/below editor, string[] or
  component factory), `setTitle`, `setEditorText`/`getEditorText`/`pasteToEditor`.
- `custom(factory, { overlay, overlayOptions, onHandle, signal, handlesCtrlC })` —
  arbitrary components, inline or overlay, with anchor/size/margin/visibility options and
  focus handles.
- Host-native fast paths: `hostSessionPicker`, `hostInputForm`.
- Chrome replacement: `setFooter`, `setHeader`, `setEditorComponent`,
  `setWorkingIndicator`/`setWorkingMessage`, `setHiddenThinkingLabel`.
- Introspection: theme access, `getChatRenderSettings`, tools-expanded state,
  `getFooterDataProvider`, `addAutocompleteProvider`, `onTerminalInput`,
  host-custom-UI state accessors.

### 1.9 Bundled-extension surfaces that must work

- **Workflows**: dispatch/status/list chat surfaces, F2 DAG graph overlay, attachable
  stage chat (a nested `ChatSessionHost`), BACKGROUND widget below the editor, input
  forms, resume picker.
- **Subagents**: transcript tool rendering + background-run widget.
- **Intercom**: ALT+M session-list overlay → compose overlay, inline message rendering.
- **MCP / web-access**: status commands, OAuth flows, curator browse UIs.

---

## 2. Architecture

### 2.1 Process model

```
┌────────────────────────────── Electron app ──────────────────────────────┐
│  Main process (Node)                     Renderer process (Chromium)     │
│  ┌─────────────────────────┐             ┌────────────────────────────┐  │
│  │ EngineSupervisor        │   typed IPC │ React UI                   │  │
│  │  spawns `atomic` engine │◄───────────►│  transcript, composer,     │  │
│  │  child per window/tab   │ (contextBr.)│  selectors, overlays,      │  │
│  │ JSONL client (protocol  │             │  ANSI frame surface,       │  │
│  │  v2 + RPC commands)     │             │  theme engine              │  │
│  │ Host services: settings,│             └────────────────────────────┘  │
│  │  keybindings, sessions  │                                             │
│  │  listing, file search,  │                                             │
│  │  clipboard, git branch  │                                             │
│  └───────────┬─────────────┘                                             │
└──────────────┼───────────────────────────────────────────────────────────┘
               │ stdio JSONL
        ┌──────▼──────────────────────────┐
        │ Engine child: `atomic` binary   │
        │ (agent loop, extensions, tools, │
        │  sessions, models, compaction)  │
        └─────────────────────────────────┘
```

**Why the interactive-engine protocol, not plain RPC mode or the SDK:**

| Option | Verdict | Reason |
|---|---|---|
| `--mode rpc` | Insufficient alone | RPC deliberately degrades extension UI: `custom()` returns `undefined`, `setFooter`/`setEditorComponent`/`setWorkingIndicator` are no-ops, widget component factories are ignored (`docs/rpc.md`). Parity for workflows/intercom overlays is impossible on it. |
| Embed `AgentSession` SDK in Electron main | Rejected as primary | Couples the GUI's Node runtime to the agent's (the shipped binary is Bun-compiled; extensions assume the engine environment); no crash isolation — a wedged extension freezes the app; duplicates the supervision the engine host already has (watchdog, escape hatch, restart). Keep as a possible test seam only. |
| **Interactive-engine protocol (v2)** | **Chosen** | Already carries everything the terminal host needs: RPC command set + `engine_custom_*` remote-rendered frames, session-picker channel, input-form channel, terminal-mode allowlist, heartbeats/watchdog, cooperative abort, Ctrl+C escape hatch. The GUI implements the *host* side, exactly like `src/modes/interactive/` does. |

The engine child is spawned from the user's installed `atomic` (resolved like the
terminal host does), one child per window/tab. Version skew is handled by the existing
`INTERACTIVE_ENGINE_PROTOCOL_VERSION` handshake: mismatch → actionable error suggesting an
update.

### 2.2 The ANSI frame surface — extension `custom()` parity

The single hardest parity problem is `ctx.ui.custom()`: extensions ship arbitrary
components whose `render(width)` returns ANSI-styled strings. Reimplementing pi-tui in DOM
is a non-starter. But under engine isolation this is **already solved as a protocol**: the
child renders frames (`engine_custom_frame` line arrays) at a width the host chooses, and
the host forwards input (`engine_custom_input`) and disposal. The terminal host paints
those lines into the TTY; the GUI paints them into an **ANSI frame surface** — a
monospace, ANSI-SGR/OSC-8-aware renderer (xterm.js in a fixed-size element, or a lighter
ANSI-to-DOM renderer since frames are full repaints, not a stream).

Consequences:

- Workflows' F2 graph, intercom overlays, snake.ts, and every third-party custom
  component render pixel-faithfully with zero per-extension work.
- Overlay geometry (`overlayOptions`: anchor, width %, margins, `visible(w,h)`) is
  computed by the GUI against a virtual cell grid derived from the surface's font metrics,
  matching the TUI's math.
- Keyboard input to focused frames is re-encoded to the same escape sequences pi-tui's
  `matchesKey` expects (arrows, ctrl/alt/shift combos, kitty release events when
  `wantsKeyRelease`), reusing the encoding tables from `interactive-key-identity.ts`.
- `tui.terminal` setters (mouse-scroll tracking, autowrap) map to surface-local behavior;
  the allowlist in `terminal-mode-controller.ts` is the contract.
- `setFooter`, `setHeader`, `setEditorComponent`, and widget *component factories* are the
  same mechanism: remote-rendered frames mounted into the corresponding GUI slots. Where
  the current engine protocol renders these host-side instead, §5 lists the protocol
  additions needed.

Native GUI components are used everywhere else. The frame surface is the compatibility
floor, not the default look.

### 2.3 What the GUI renders natively

- **Transcript**: virtualized list (streaming-append friendly). Markdown via a CommonMark
  pipeline + Shiki, mapped to the active Atomic theme's `md*`/`syntax*` tokens. Diffs from
  tool details rendered as native diff blocks (`toolDiffAdded/Removed/Context` tokens).
  Images inline (no kitty-protocol constraints). Thinking blocks collapsible, honoring
  `hiddenThinkingLabel` and `ctrl+t`. Tool cards with the `ctrl+o` expand state; tools
  that provide `renderCall`/`renderResult` components fall back to the frame surface
  per-entry (remote tool render already exists: `RemoteToolExecutionComponent`).
- **Composer**: CodeMirror 6 (multiline, decorations for paste markers and bash-mode
  styling, IME-correct). Autocomplete popover fed by host services (§2.4). History,
  queue chips showing pending steer/follow-up messages (from `queue_update`), and the
  dequeue action.
- **Selectors/dialogs**: native panels for the built-in set — settings, model,
  scoped-models, thinking, fast-mode, resume, tree, fork, trust, login/logout, theme —
  driven by the same RPC commands and host services the TUI uses. The tree navigator
  becomes a real interactive tree with the same filters/labels/fold semantics.
- **Extension dialogs** (`select`/`confirm`/`input`/`editor` + `hostInputForm` +
  `hostSessionPicker`): native modals implementing the existing request/response channels,
  including timeout countdowns.
- **Widgets/status/notify**: string[] widgets → styled blocks above/below composer;
  `setStatus` → status-bar segments; `notify` → toast + optional OS notification.

### 2.4 Host services (Electron main)

Things the terminal host does in-process that the GUI main process must own:

- **Settings & keybindings**: read/watch `~/.atomic/agent/settings.json`,
  project `.atomic/settings.json`, `keybindings.json`; write-through for the settings UI.
- **Session listing** for the resume picker (the TUI lists sessions host-side via
  `SessionManager` paths; RPC has no `list_sessions` — either add one (§5) or read the
  session directory in main, matching `session-manager-list.ts` semantics including the
  internal-workflow-session exclusion).
- **File search** for `@` mentions (fuzzy project index, gitignore-aware).
- **Git branch** watcher for the footer (mirrors `footer-data-provider.ts`).
- **Clipboard** (text + image paste), **external editor** launch, **shell/URL open**,
  **drag-and-drop** ingestion to attachments.
- **Theme loading**: parse Atomic theme JSON from built-ins + user/project dirs, emit CSS
  custom properties (one variable per theme token: `text`, `accent`, `muted`, `border*`,
  `md*`, `syntax*`, `toolDiff*`, `thinking*`, `bashMode`, `*Bg`). Dark/light/custom themes
  and live reload behave identically to the TUI.
- **Engine supervision**: spawn/restart, heartbeat watchdog, cooperative Escape abort,
  Ctrl+C escape-hatch equivalent (a "Force stop" affordance), crash surface with restart.

### 2.5 Renderer stack

- **Electron** (contextIsolation on, nodeIntegration off, sandboxed renderer; all
  privileged work behind a typed `contextBridge` API).
- **electron-vite + electron-builder** for dev/build/packaging (mac/win/linux,
  auto-update via electron-updater).
- **React + TypeScript** (strict, matching repo compiler settings), **zustand** for
  session/UI state (streaming-friendly, no re-render storms), **CodeMirror 6** composer,
  **xterm.js** (or minimal ANSI renderer) for frame surfaces, **Shiki** for code/diff
  highlighting.
- State derives from the event stream: `message_start/update/end`,
  `tool_execution_*`, `bash_execution_update`, `queue_update`, `compaction_*`,
  `auto_retry_*`, plus `get_entries`' durable-cursor semantics for reload/reconnect
  (entry ids as cursors survive restarts).

### 2.6 Multi-session UX (GUI-native, parity-plus)

Tabs or a sidebar of open sessions, each backed by its own engine child. This maps
naturally onto workflows' stage chats (attach opens a tab/split instead of swapping the
overlay) and intercom (cross-session messaging gets a real inbox). These enhancements ride
on the same protocol; parity items never depend on them.

---

## 3. Keyboard, focus, and editor semantics

1. **Keymap engine**: load `keybindings.json`, apply the same `app.*` action ids, and
   route by focus zone (composer / transcript / modal / frame surface), mirroring
   `interactive-input-handling.ts` priorities: focused overlay > modal > composer.
   Double-escape honors `doubleEscapeAction`. Extension `registerShortcut` entries arrive
   via the engine and register globally.
2. **Streaming semantics** exactly as the TUI: Enter steers, Alt+Enter follows up, Escape
   aborts (restoring queued messages to the composer), Ctrl+C abort-or-clear with
   double-press exit, queue-pause on abort until next ordinary submit.
3. **Custom editors** (`setEditorComponent`): when an extension swaps the editor, the
   composer slot switches to a frame surface hosting the remote editor component; the
   native composer returns when the extension restores the default. Document the trade-off
   (extension editors get terminal-fidelity, not native-widget fidelity).
4. **Text selection/scrollback** are native (a real win over the TTY): selection never
   fights streaming; copy actions (`ctrl+x` copy-last-message, `/copy`) also exist as
   buttons/context menus.

---

## 4. Repo placement and toolchain constraints

- New workspace **`packages/gui`** (name `@bastani/atomic-gui`, `private: true`),
  **excluded from the `@bastani/atomic` bundle** and from the shipped-binary build. The
  "no build step for companion packages" rule applies to packages bundled into atomic;
  this is a standalone app and necessarily has its own electron-vite build — call that
  exception out in `AGENTS.md` when the package lands.
- **npm-only**: dependencies go through root `package-lock.json` via `npm install`
  (`.npmrc` release-age gate applies; Electron/electron-builder are devDependencies of the
  gui workspace). No second lockfile, no `bun install`.
- **CI**: gui gets its own jobs (typecheck, unit, packaging smoke) added to the existing
  workflow topology *without* disturbing the nine required contexts;
  `test/ci/test-workflow-topology.test.ts` assertions are updated in the same change.
  Distribution is a separate release artifact (dmg/nsis/AppImage) — it does not enter the
  npm publish pipeline.
- **Design language**: Catppuccin Mocha per `DESIGN.md` as the canonical dark theme, with
  the theme engine mapping any Atomic theme; the `ui/*.html` mockups (dispatch cards,
  status bands, `▸ /command` hint grammar, attach/stage-chat flows) are the visual
  reference for workflows surfaces.

---

## 5. Engine/protocol gaps to close upstream

Work in `packages/coding-agent` so the GUI never forks agent logic. Each is additive and
benefits any future host:

1. **`list_sessions`** RPC command (paged, with names/timestamps/cwd, internal-session
   exclusion flag) — today only the terminal host can enumerate sessions in-process.
2. **Autocomplete data**: `get_commands` exists; add argument-completion queries (the TUI
   computes these host-side from engine data today) or expose the provider results over
   the engine channel, including extension `addAutocompleteProvider` output.
3. **Remote chrome frames**: confirm `setFooter`/`setHeader`/`setEditorComponent`/widget
   component factories are remote-renderable over the engine protocol for non-TTY hosts
   (the isolated terminal host renders some of these host-side); add frame channels where
   missing.
4. **Theme/settings introspection**: commands to read the resolved theme list and token
   values, and to read/write settings through the engine (so trust and per-project
   resolution stay in one place), rather than the GUI re-implementing merge semantics.
5. **Keybinding/shortcut registry**: expose extension-registered shortcuts (F2, ALT+M)
   with descriptions so the GUI can bind and display them in its command palette and
   hotkeys view.
6. **Host identification**: a `hostInfo` field in the engine handshake (`terminal` vs
   `gui`) so extensions can adapt if they choose; `ctx.hasUI` stays true and `ctx.mode`
   semantics are decided deliberately (likely a new `"gui"` value with `"tui"`-equivalent
   capability guarantees — needs a docs pass since extensions today guard on
   `ctx.mode === "tui"` for `custom()`).

---

## 6. Milestones

Ordered by dependency; each ends green and demoable.

- **M0 — Skeleton + engine bridge.** Workspace scaffolding, window shell, engine spawn +
  JSONL client with protocol handshake, typed IPC bridge, raw event log view. Exit
  criterion: prompt round-trips and streams text deltas into the window.
- **M1 — Core chat parity.** Transcript renderer for all entry kinds (§1.2): streaming
  markdown, thinking blocks + toggle, tool cards with expand/collapse and diff/image
  rendering, bash entries, compaction boundaries, branch summaries; working indicator;
  footer + usage meter; abort. Remote tool-render frames on the ANSI surface.
- **M2 — Input system.** CodeMirror composer, slash + `@` + path autocomplete, history,
  bash `!`/`!!` mode, paste/drag attachments with collapse markers, external editor,
  steering/follow-up queue with chips and dequeue, keymap engine with user overrides.
- **M3 — Sessions.** Resume picker (search/sort/filter/rename/delete), `/new`, naming,
  tree navigator with filters/labels/fold and edit-resubmit, fork, clone, export/share,
  manual + auto compaction UX. Depends on §5.1.
- **M4 — Models, settings, theming, auth.** Model selector + scoped models + thinking +
  fast mode, full settings UI (write-through), theme engine with live reload and custom
  theme dirs, login/logout OAuth + API-key flows, project trust dialog, first-run
  onboarding.
- **M5 — Extension UI host.** Dialog channel (`select`/`confirm`/`input`/`editor` +
  timeouts), notify/status/widgets/title, `hostInputForm`, `hostSessionPicker`, then the
  frame surface: `custom()` inline + overlays with full `overlayOptions` geometry, focus
  handles, key encoding incl. release events, terminal-mode allowlist, custom
  footer/header/editor swap. Exit criterion: `examples/extensions/` overlay-qa-tests,
  modal-editor, snake, custom-footer all behave correctly.
- **M6 — Bundled extensions parity.** Workflows end-to-end (dispatch/status/list, F2
  graph, BACKGROUND widget, stage-chat attach — as tab/split), subagents widget, intercom
  overlays + ALT+M, MCP auth flows, web-access browse UIs. Exit criterion: scripted
  walkthrough of `docs/workflows.md` scenarios in the GUI.
- **M7 — Productization.** Packaging + code signing + auto-update, crash/restart UX for
  the engine child, performance passes (long transcripts, fast streams), accessibility
  (keyboard-only operation, screen-reader labels), security review (CSP, IPC surface,
  no remote content), docs (`docs/gui.md`), release pipeline.

Parallelizable: M3/M4 after M1; M5's dialog channel can start during M2; §5 protocol work
proceeds alongside M0–M2.

## 7. Testing strategy

- **Protocol conformance**: a host-side test double that replays recorded engine JSONL
  transcripts (goldens generated from the real engine) into the renderer store; assert
  derived state. Run under the repo's vitest conventions (`node:assert/strict`, 30 s
  budget rules).
- **Frame-surface goldens**: render recorded `engine_custom_frame` payloads and snapshot
  the ANSI→DOM output; reuse `examples/extensions/overlay-qa-tests.ts` as the corpus.
- **E2E**: Playwright-driven Electron against a real engine child with a scripted fake
  provider (the repo's existing test-provider seams), covering prompt/steer/abort,
  session picker, tree fork, workflow dispatch + attach.
- **Keyboard matrix**: unit tests for keymap routing per focus zone, incl. Windows
  variants (`alt+v`, `ctrl+enter`).

## 8. Risks

| Risk | Mitigation |
|---|---|
| Protocol drift between GUI host and engine versions | Handshake version gate (exists); conformance suite pinned to protocol v2; §5 additions are versioned. |
| ANSI surface fidelity (wide chars, OSC-8 links, kitty images in frames) | Full repaints simplify things; start with xterm.js (battle-tested measurement); goldens from real extensions. Kitty-image frames degrade to placeholders initially — native image rendering covers the common tool-output path. |
| `ctx.mode === "tui"` guards in third-party extensions skip `custom()` on a non-tui mode string | Decide §5.6 early; likely report a mode that satisfies existing guards' *intent* and document it. |
| Streaming render performance on huge transcripts | Virtualization + append-only entry model from day one; perf budget tests in M7. |
| Composer parity edge cases (IME, paste markers, bash-mode) | CodeMirror 6 chosen specifically for IME + decorations; the TUI's `interactive-submission.ts` behavior is the spec. |
| Scope creep into GUI-native redesigns before parity | Milestones gate parity first; enhancements (tabs, splits) explicitly ride the same protocol and never block parity exits. |

## 9. Difficulty characterization

Invasiveness on existing code is **low**: the engine, extensions, and TUI are untouched
except for the additive protocol commands in §5 (each a contained change in
`src/modes/rpc/` / `src/modes/interactive-engine/` with contract tests). The bulk of the
work is **new** renderer/host code: the transcript + composer (largest single component),
the frame surface with correct key encoding and overlay geometry (highest technical risk),
and the long tail of built-in selectors. Dependencies: Electron toolchain entering the npm
workspace under the `.npmrc` gate, and CI topology updates guarded by the existing
contract tests.
