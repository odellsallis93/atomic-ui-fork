# Desktop acceptance checklist

This checklist supplies the required manual evidence for `@bastani/atomic-gui`
behaviour that cannot be deterministic in CI: provider-backed streaming, native
selection/drag interactions, browser authentication, and credentialed sharing.
It is deliberately a GUI-host checklist, not a TUI migration guide. The normal
`atomic` CLI must still start and run without Electron or this package installed.

The real-engine smoke suite imports and pages a generated 10,000-entry Atomic
JSONL session without credentials. Native Electron long-scroll and text
selection remain a manual desktop gate because the Playwright confirmation
harness is not deterministic in this environment; do not promote that row from
the ledger until a desktop walkthrough records the result.

Run a development GUI against an isolated Atomic home and a non-production test
repository:

```sh
ATOMIC_CODING_AGENT_DIR="$(mktemp -d)" npm run dev --workspace=@bastani/atomic-gui
```

Record the Atomic version, OS, provider/model, test date, and result beside each
applicable item. Do not record API keys, OAuth callbacks, Gist tokens, session
content containing secrets, or screenshots with credentials.

## M1 — Core chat

- [ ] Send a provider-backed prompt; verify incremental assistant text and the
  working indicator appear, then disappear at completion.
- [ ] Toggle an assistant thinking block without losing transcript position.
- [ ] Expand/collapse a tool card; inspect a diff and an image result where the
  configured provider/tool can create them.
- [ ] Run `!` bash and verify streamed output, completion, and abort behavior.
- [ ] Create a branch summary and a compaction boundary; verify both remain
  visible after restart/resume.
- [ ] Load a session with at least 10,000 rows, manually select text away from
  the bottom, and verify new output does not pull the viewport to the bottom.

## M2 — Input system

- [ ] Verify slash arguments, `@` references, and path completion against the
  configured engine and at least one extension autocomplete provider.
- [ ] Use external editor, history navigation, `!`/`!!`, paste-marker expansion,
  and file/image drag-drop.
- [ ] Confirm a user keybinding and steering/follow-up/dequeue behavior while
  messages are in flight; abort and then send a new message successfully.
- [ ] With a credentialed image provider only, verify attachment normalization
  and provider validation. This is intentionally not a CI requirement.

## M3 — Sessions

- [ ] Resume, search, sort, rename, delete, fork, clone, import, and export a
  session; restart the GUI and verify durable state is still engine-owned.
- [ ] Navigate the tree, edit/resubmit a user node, and verify manual and auto
  compaction boundaries.
- [ ] With `gh` authenticated to a disposable account, invoke **Share** and
  verify the resulting Gist URL. Confirm the renderer never displays a token or
  accesses the credential store directly.

## M4 — Settings, auth, and trust

- [ ] Verify global/project setting precedence and theme selection, including a
  live refresh after an external valid settings change.
- [ ] Configure and clear the scoped-model cycle; confirm its order is used by
  `ctrl+p` without restarting the engine.
- [ ] Reject an invalid settings mutation without corrupting the settings file.
- [ ] Complete and cancel OAuth; verify cancellation leaves no visible secret.
- [ ] Exercise trust choices and first-run recovery from a clean Atomic home.
  The engine must be started after trust is resolved before provider auth and
  model selection are available.

## M5 — Extension UI host

The real-engine suite proves protocol response round-trips and timeout defaults;
the following checks cover the actual Electron interaction surface.

- [ ] Run the extension examples for overlays, inline frames, timed dialogs,
  widgets, status, header/footer/editor replacement, and focus return.
- [ ] Verify `ctx.ui.getEditorText`, theme accessors, autocomplete providers,
  and ordered terminal interception (consume and transform).
- [ ] Verify kitty key-release encoding and terminal controls in a supported
  terminal configuration.
- [ ] Confirm extensions see `hostInfo.kind === "gui"` while existing
  `ctx.mode === "tui"` guards remain true.

## TUI compatibility smoke

After GUI acceptance, run this separately from any Electron process:

```sh
ATOMIC_CODING_AGENT_DIR="$(mktemp -d)" node packages/coding-agent/dist/cli.js --help
```

The command must succeed without `packages/gui` being built, installed, or
launched. Any failure here blocks GUI promotion because the GUI protocol is an
additive optional host surface.
