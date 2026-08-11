# GUI interactive capability ledger

Parity tracker for `@bastani/atomic-gui`. **Do not claim parity from fake-engine unit tests alone.**

| Column | Meaning |
|---|---|
| Capability | Interactive user-facing capability |
| GUI route / exclusion | Native control, slash command, shortcut, or deliberate exclusion |
| Evidence | Test file, source, or walkthrough |
| Class | `fake` · `unit` · `real-engine` · `e2e` · `manual` · `docs` |
| Status | `proven` · `partial` · `open` · `excluded` |

**Parity rule:** a capability may be marked practical-parity only when it has a `real-engine` or `e2e` evidence row (plus any required manual OS walkthrough). `fake` / pure `unit` rows prove host structure only.

## Fake-engine boundary (Phase 1.4)

| Surface | Class | What it proves | What it does **not** prove |
|---|---|---|---|
| `test/engine-client.test.ts` | fake | JSONL handshake, RPC response shape, image payload echo | Real CLI bootstrap, provider delivery, session JSONL durability |
| Most `test/*.test.ts` store/helpers | unit | Renderer/store pure behavior | Engine semantics, IPC round-trip, Electron chrome |
| `test/real-engine-smoke.test.ts` | real-engine | Start/stream/abort/restart, version-mismatch clarity, session leaf alignment after switch | Full LLM prompt quality, Electron UI, OAuth, packaging |
| `test/electron-phase2.e2e.test.ts` | fixture E2E | Electron renderer-host queue, session disposition, tree, focus, label, and compaction flows | Atomic CLI/provider semantics; see `docs/e2e-harness.md` |

## Interactive capabilities

| Capability | GUI route / exclusion | Evidence | Class | Status |
|---|---|---|---|---|
| Engine start + protocol v2 handshake | Auto on window; `EngineSupervisor.start` | `real-engine-smoke.test.ts` (“start handshake”); `engine-client.ts` | real-engine | proven |
| Prompt / stream events | Composer Enter → `prompt` RPC | Bash stream stand-in in `real-engine-smoke.test.ts`; fake prompt echo in `engine-client.test.ts` | real-engine + fake | partial — **LLM provider prompt/stream is an approved gap / follow-up** (CI avoids live model cost); streaming protocol proven via real bash events |
| Abort in-flight work | Esc / Abort control → `abort` RPC | `real-engine-smoke.test.ts` (“abort RPC”) | real-engine | proven |
| Engine restart (stop→start) | Supervisor recreates client | `real-engine-smoke.test.ts` (“restart”) | real-engine | proven |
| Version-mismatch failure clarity | Host rejects bad `engine_ready` | `real-engine-smoke.test.ts` (“version-mismatch”); `engine-client.ts` | fake (host path) | proven |
| Session switch / reload integrity | Session picker → `switchSession` + `resetTranscript` + `hydrateTranscript(entries, leafId)` | `session-store.test.ts` (“hydrateTranscript follows only the active leaf path…”; “session switch hydration…”); `real-engine-smoke.test.ts` (leaf alignment); `App.tsx` | unit + real-engine | partial — the renderer now walks `parentId` from the engine-owned `leafId`, so `get_entries` history does not expose abandoned branches; host replace+leaf proven, corpus/E2E remains open |
| Transcript kinds (user/assistant/custom/skill/system/branch/compaction/tool/bash) | `Transcript.tsx` / `session-store` | `session-store.test.ts` active-leaf, multi-tool, live tool merge, direct bash, thinking/image, compaction, and `entry_appended` cases; source protocol shapes in `packages/coding-agent/src/core/session-manager-types.ts`, `agent-session-types.ts`, and `modes/rpc/rpc-command-handler.ts` | unit | partial — Phase 2.1 host behavior covers durable/live protocol forms; no real-engine transcript corpus/E2E proof |
| Transcript virtualization / long scroll | `Transcript.tsx` variable-height window with bottom-only auto-follow | `virtual-window.test.ts` covers 10,000 measured rows and manual-scroll follow threshold; `session-store.test.ts` retains streaming, expansion, frame, and active-leaf state | unit | partial — bounded renderer and scroll policy are unit-proven; Electron long-scroll/manual selection walkthrough remains open |
| Composer text + `/` + `@` | `Composer.tsx`, `Autocomplete.tsx` | `composer-parity.test.ts`; effective binding state from `engine_keybindings_reloaded` | unit | partial — configured composer bindings and large-paste expansion are unit-covered; generic-path and desktop walkthrough remain open |
| Queue / steer / follow-up chips | Composer queue UI | `composer-parity.test.ts`; renderer-host fixture pause/resume/dequeue in `electron-phase2.e2e.test.ts` | unit + fixture E2E | partial — Electron UI and protocol-v2 payload rendering are proven; real-engine Electron proof remains open |
| Image paste / DnD attachments | Composer + `App.addPastedImages` | `attachments.test.ts`; fake image echo in `engine-client.test.ts` | unit + fake | partial — Phase 0 wire shape proven; real-engine image provider path still open (G3) |
| Sessions list/resume/rename/delete/clone/export/compact/tree | Session picker / tree modal; engine `fork`, `import_session`, `set_label`, `get_commands` | unit tests plus stateful renderer-host fork/import/active-leaf/label/tree-resubmit/compaction in `electron-phase2.e2e.test.ts` | unit + fixture E2E | partial — renderer-host disposition and durable refresh behavior are proven. Share stays excluded; Atomic CLI/provider Electron proof remains open. |
| Models / thinking | Model picker; cycle RPCs | `engine-client.test.ts`, protocol `get_available_models` / `set_model` / `set_thinking_level` | unit + RPC | partial — model and thinking are session-owned; protocol v2 has no scoped-selection or fast-mode command, so the GUI cannot safely persist either without an engine addition. |
| Settings precedence | Settings panel | `settings-store.test.ts`; engine `settings-manager` source | unit | partial — GUI may only display/apply the theme setting. The full TUI settings tree and global/project merge stay engine-owned; protocol v2 exposes no settings snapshot or mutation RPC. |
| Themes | Settings panel | `theme-loader.test.ts` (builtin < user < project, next-read reload) | unit | partial — canonical `.atomic/themes` project files load with the engine order. Configured theme paths and engine resource reload require a resource/settings RPC, which v2 does not expose. |
| Auth / trust / first run | Auth + trust dialogs | `project-trust.test.ts`; Electron fixture host boundary | unit | partial — renderer receives provider names and challenge text only. Credentials stay in engine auth flows; no GUI reads, logs, or returns them. First-run model choice has no persistent v2 route. |
| Extension UI host (dialogs/forms/frames) | Generic modals + `ChromeFrame` | `session-store.test.ts`, `ansi` / overlay / key tests, fixture E2E | unit + fixture E2E | partial — select/confirm/input/editor, host forms/picker, working/status/widgets, chrome and frames route generically. `onTerminalInput`, `getEditorText`, autocomplete provider, and RPC theme APIs are engine-declared synchronous/protocol exclusions. |
| Bundled extensions (workflows/subagents/intercom/MCP/web) | Generic frames only | — | — | open (Phase 4 / M6) |
| CLI machine interfaces (`--print`, `--mode json/rpc`, pipes) | **Excluded** (§3.3) | plan exclusions | docs | excluded |
| Package admin / credential print / multi-window tabs | **Excluded** or deferred (G11) | plan exclusions | docs | excluded |
## Phase 3 exit review (2026-08-11)

Phase 3 cannot exit under protocol v2 alone. The host now resolves canonical project themes with builtin < user < project precedence and re-reads custom files on the next supported refresh. Dialogs cancel on Escape or a supplied timeout and restore prior focus. The required GUI gates passed after building the documented local native prerequisite.

The remaining requested settings tree, scoped model persistence, fast mode, configured project-theme paths, and first-run persistent model selection have no v2 RPC. Implementing renderer-owned copies would violate the engine-authority contract; adding new engine RPCs or changing protocol identity exceeds this Phase 3 v2 boundary. Fixture Electron E2E remains renderer-host proof only, not real-engine or provider proof.


## Open gates (do not silently close)

| Gate | Topic | Ledger impact |
|---|---|---|
| G3 | Image normalize/resize/`blockImages` authority | Attachment real-engine row stays partial |
| G6 | Default new-chat session persistence | New-chat route notes remain open |
| G7 | Legacy `/import`, `/atomic` | **Excluded:** `engine-client.test.ts` verifies `get_commands` accepts only the runtime extension/prompt/skill sources; the runtime handler inventories neither legacy name. Import uses `import_session` RPC. |
| G8 | Fork / share / import | Fork and JSONL import route through existing RPC. **Share excluded:** protocol v2 and runtime inventory expose no route. |
| G9 | Settings/theme resolution into engine RPC | Settings partial |
| G10 | Protocol identity changes | Protocol stays v2 |

## How to update

1. Add/adjust a row when a capability gains a route or evidence.
2. Promote `partial` → `proven` only with new `real-engine` or `e2e` evidence.
3. Never delete exclusion rows; mark status `excluded` with rationale.
4. Keep this file linked from `packages/gui/README.md`.
