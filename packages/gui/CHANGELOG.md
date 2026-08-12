# Changelog

## [Unreleased]

### Added

- Initial Electron GUI host (`@bastani/atomic-gui`) that spawns an isolated Atomic
  interactive-engine child over JSONL protocol v3, with typed IPC, a Catppuccin Mocha
  chat shell, streaming transcript rendering for core entry kinds, and a CodeMirror
  composer (send / steer / follow-up / abort).
- Slash-command and `@` file autocomplete, prompt history, `!`/`!!` bash execution,
  usage meter, thinking toggle, session resume picker (host-side listing), model
  picker + cycle model/thinking, and native extension UI dialogs/toasts/widgets/status.
- Richer session management: search/sort/all-projects resume picker, rename/delete,
  clone, export HTML, compact, and a session tree navigator (`get_tree` /
  `navigate_tree`).
- Engine-owned theme snapshots that validate and persist theme selection, resolve CSS
  custom properties, report global/project precedence, and keep settings/theme paths out
  of Electron's renderer.
- Cancellable engine autocomplete queries that replace renderer-local slash arguments and
  file completion, including extension `addAutocompleteProvider` wrappers and the
  engine-computed replacement text/cursor.
- Ordered engine terminal-input interception for extensions. Handlers preserve registration
  order and can consume or transform composer input before the GUI applies it.
- Engine-owned validated settings operations for queue behavior, compaction, retry, and
  Codex fast-mode controls; the renderer receives a resolved settings snapshot and never
  writes configuration files directly.
- GUI engine windows now use Atomic's normal durable-session default, allowing real
  import/list/resume/new-session behavior instead of forcing `--no-session`.
- GUI-created empty sessions, including replacement sessions after deleting the active
  session, now persist their Atomic session header immediately for reliable resume.
- Session deletion now uses a validated engine RPC, so Electron no longer removes Atomic
  session files directly.
- Session rename now uses a validated engine RPC, so Electron no longer appends session
  metadata directly.
- ANSI frame overlay for `engine_custom_open` / `engine_custom_frame` /
  `engine_custom_close`, with basic keyboard input forwarded as
  `engine_custom_input`.
- Provider auth panel (API key + OAuth), OAuth extension UI dialogs, and
  `engine_input_form_*` host for credential prompts.
- Provider auth actions now follow engine-reported API-key, OAuth, and stored-credential
  capabilities, so unsupported login and logout buttons are not offered.
- Project trust dialog now uses typed engine RPCs backed by Atomic's existing
  trust store. Electron never reads or writes `trust.json`; session-only choices
  remain a transient launch override.
- Transcript entries now retain and render engine-supplied PNG, JPEG, GIF, WebP, and AVIF
  attachments. Non-raster image MIME types are rejected before reaching the renderer.
- Unified-diff tool results now use safe added/removed/hunk line styling instead of an
  undifferentiated text block.
- External-editor launches now use the engine-resolved Atomic `externalEditor` command,
  rather than independently resolving renderer-side settings.
- Settings now include an engine-owned default visibility preference for thinking blocks;
  the existing thinking hotkey remains a session-local toggle.
- The Settings panel can configure model-cycle scope through validated engine patterns;
  accepted patterns persist in Atomic settings and apply to the active session immediately.
- Named extension theme selections now refresh the GUI from an engine-resolved CSS snapshot,
  keeping theme files and arbitrary CSS out of the renderer.

### Removed

- Removed the unused host-side theme filesystem resolver. Theme discovery and resolution
  now have only the engine-owned RPC path.
- Frame key encoding maps arrows, function keys, ctrl/alt chords, and shift-tab
  to legacy terminal sequences that pi-tui `matchesKey` accepts, with kitty
  `:3` release events on keyup for `wantsKeyRelease` components.
- Frame host render loop: `engine_custom_render` on open/invalidate, pipelined
  after input, `overlayOptions` geometry, hide/show/focus control, mouse-scroll
  wheel reports, and autowrap terminal-mode styling.
- Host-native session picker for `engine_session_picker_*` (`ctx.ui.hostSessionPicker`).
- Durable transcript hydration when opening, switching, or navigating a session; command
  argument completions and engine-reported extension shortcuts in the GUI host.
- Remote custom header and footer components (`ctx.ui.setHeader` / `ctx.ui.setFooter`)
  rendered through the interactive-engine frame protocol.
- Remote custom editor components (`ctx.ui.setEditorComponent`) with terminal-key input,
  text get/set support, and prompt submission through the active engine session.
- Engine-rendered live tool cards that reuse Atomic's `ToolExecutionComponent`, including
  partial output, expansion state, ANSI styling, and safe renderer disposal when the
  transcript changes.
- Protocol-v3 GUI host identity and a **Share session** action. Sharing stays inside the
  engine's GitHub CLI flow and returns only the safe viewer URL to the renderer.

### Fixed

- Fixed extension editor dialogs dropping their timeout and abort-signal options. GUI dialogs
  now cancel editor, select, confirm, and input requests consistently when the engine deadline
  or owning extension signal fires.
- Timed extension dialogs now display their live cancellation countdown in the dialog title.
- Fixed `ctx.ui.setWorkingVisible(false)` leaving the built-in footer loader visible. Both
  Electron working indicators now follow the extension's visibility setting.
- Fixed GUI settings batches partially applying before a later operation was rejected by
  Atomic. The engine now validates the full batch before updating the effective snapshot.
- Fixed `@` file completion to retain the shared Atomic engine fallback used by the TUI
  when the primary completion chain has no result.
- Fixed the configurable `tui.input.newLine` composer action. Shift+Enter and user-remapped
  newline bindings now insert a native CodeMirror newline after terminal interception.
- Fixed the engine child being SIGKILL'd shortly after start because the host
  pre-created the interactive-engine guardian stop file; the path is reserved at
  launch and the file is written only when stopping the engine, matching the RPC
  host in `@bastani/atomic`.
