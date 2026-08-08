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
