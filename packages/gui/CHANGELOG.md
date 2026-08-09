# Changelog

## [Unreleased]

### Added

- Initial Electron GUI host (`@bastani/atomic-gui`) that spawns an isolated Atomic
  interactive-engine child over JSONL protocol v2, with typed IPC, a Catppuccin Mocha
  chat shell, streaming transcript rendering for core entry kinds, and a CodeMirror
  composer (send / steer / follow-up / abort).
- Slash-command and `@` file autocomplete, prompt history, `!`/`!!` bash execution,
  usage meter, thinking toggle, session resume picker (host-side listing), model
  picker + cycle model/thinking, and native extension UI dialogs/toasts/widgets/status.
- Richer session management: search/sort/all-projects resume picker, rename/delete,
  clone, export HTML, compact, and a session tree navigator (`get_tree` /
  `navigate_tree`).
- Theme loader that maps Atomic theme JSON (builtins + `~/.atomic/agent/themes/`) to
  CSS custom properties, with settings write-through for the `theme` key.
- ANSI frame overlay for `engine_custom_open` / `engine_custom_frame` /
  `engine_custom_close`, with basic keyboard input forwarded as
  `engine_custom_input`.
- Provider auth panel (API key + OAuth), OAuth extension UI dialogs, and
  `engine_input_form_*` host for credential prompts.
- Project trust prompt backed by `~/.atomic/agent/trust.json` (including
  session-only decisions) before engine start.
- Frame key encoding maps arrows, function keys, ctrl/alt chords, and shift-tab
  to legacy terminal sequences that pi-tui `matchesKey` accepts, with kitty
  `:3` release events on keyup for `wantsKeyRelease` components.
- Frame host render loop: `engine_custom_render` on open/invalidate, pipelined
  after input, `overlayOptions` geometry, hide/show/focus control, mouse-scroll
  wheel reports, and autowrap terminal-mode styling.
- Host-native session picker for `engine_session_picker_*` (`ctx.ui.hostSessionPicker`).
- Durable transcript hydration when opening, switching, or navigating a session; command
  argument completions and engine-reported extension shortcuts in the GUI host.

### Fixed

- Fixed the engine child being SIGKILL'd shortly after start because the host
  pre-created the interactive-engine guardian stop file; the path is reserved at
  launch and the file is written only when stopping the engine, matching the RPC
  host in `@bastani/atomic`.
