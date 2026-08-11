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
| `test/electron-phase2.e2e.test.ts` | fixture E2E | Electron renderer-host queue/session/tree plus Phase 3 focused-frame/dialog keyboard routing and focus recovery | Atomic CLI/provider semantics; this fixture is not a real-engine extension claim |

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
| Models / thinking | Model picker; cycle/set RPCs | `engine-client.test.ts`; `phase3-settings-ui.test.tsx`; protocol `get_available_models` / `set_model` / `set_thinking_level` | unit + fake RPC | partial — GUI now parses engine `scopedModels`, displays scoped entries first, and routes model/thinking mutations through v2 RPC. Persistence/scope remain engine/session-owned; fixture tests are not provider proof. |
| Settings precedence | Settings panel | `settings-store.test.ts`; engine `settings-manager-core.ts` global→project merge source | unit | partial — GUI reads effective theme with global→project precedence but no longer writes generic settings JSON. Steering, follow-up, thinking, auto-compaction, and auto-retry controls call existing engine RPCs. Full settings snapshot/mutation and Codex fast mode remain excluded because protocol v2 exposes no RPC. |
| Themes | Settings panel | `theme-loader.test.ts` (JSON names, first-match builtin→user→project, `.pi` project dir, string+numeric colors, next-read reload) | unit | partial — host can inspect builtin/user/project theme JSON that matches engine directory order and de-dupe. Persistent theme mutation and configured theme paths require an engine settings/resource RPC, which v2 does not expose. |
| Auth / trust / first run | Onboarding, auth + trust dialogs | `project-trust.test.ts`; `phase3-settings-ui.test.tsx`; Electron fixture host boundary | unit | partial — first-run panel routes users to trust, provider auth, and model selection without displaying saved credentials. Credentials stay in engine auth flows; no GUI reads, logs, writes, or returns them. |
| Extension UI host (dialogs/forms/frames) | Generic modals + `ChromeFrame` | `session-store.test.ts`, `ansi` / overlay / key tests, fixture E2E | unit + fixture E2E | partial — select/confirm/input/editor, host forms/picker, working/status/widgets, chrome and frames route generically. `onTerminalInput`, `getEditorText`, autocomplete provider, and RPC theme APIs are engine-declared synchronous/protocol exclusions. |
| Bundled web-access curator / browse | Runtime command catalog → Composer (`/websearch`, `/curator`, `/search`); runtime shortcut route; generic `DialogModal` | `electron-phase2.e2e.test.ts` (“runtime web curator and stored-search flows stay generic”); `packages/web-access/index.ts`, `index-heavy.ts`, `web-search-command.ts` | fixture E2E + source inventory | partial — curator opens its own runtime browser/Glimpse surface; stored-result browse uses generic `ctx.ui.select`/`notify`. No web-specific renderer, provider setup, cookie access, or secret display is added. |
| CLI machine interfaces (`--print`, `--mode json/rpc`, pipes) | **Excluded** (§3.3) | plan exclusions | docs | excluded |
| Package admin / credential print / multi-window tabs | **Excluded** or deferred (G11) | plan exclusions | docs | excluded |
## Phase 3 exit review (2026-08-11)

Phase 3 settings/theme/model/onboarding review fixes preserve protocol v2 and engine authority. The GUI now uses read-only global→project theme precedence, no longer writes generic settings JSON, resolves themes by JSON `name` with first-match builtin→user→project order, includes legacy `.pi` project themes, and supports string plus numeric color tokens. Scoped models are parsed from `get_available_models` and displayed in the model picker. Existing settings controls route through engine RPCs (`set_thinking_level`, steering/follow-up modes, auto compaction/retry).

Remaining exact boundaries: protocol v2 has no generic settings snapshot/mutation RPC, no persistent set-theme RPC, no configured theme-path/resource RPC, and no Codex fast-mode RPC despite engine-side settings accessors. The first-run panel is renderer-host guidance into existing trust/auth/model routes; it does not prove real-provider login or model availability.

## `ctx.ui.*` protocol-v2 corpus

| Corpus item | Generic route | Boundary / evidence |
|---|---|---|
| select, confirm, input, editor | `DialogModal` → `extension_ui_response` | `dialog-modal.test.tsx`; fixture dialog E2E. Editor has no v2 timeout. |
| notify, status, working, widgets, title, editor text | session store + generic chrome/widget host | `session-store.test.ts`; no extension-specific renderer. |
| custom, header/footer/editor slots, terminal input | `engine_custom_*` → `FrameOverlay`/`ChromeFrame`/`FrameRenderHost` | Store ordering, keyboard, scroll-mode tests; fixture focus E2E. |
| hostSessionPicker, hostInputForm | generic native modals | `session-store.test.ts`; renderer-host only. |
| onTerminalInput, getEditorText, autocomplete provider | no v2 host route | Engine explicitly warns these synchronous APIs are unavailable in RPC mode. |
| RPC theme APIs and configured resource paths | no v2 host route | Engine returns no host value; GUI does not invent a parallel authority. |

The corpus inventory is source-backed by `packages/coding-agent/src/core/extensions/ui-types.ts` and `modes/rpc/rpc-extension-ui.ts`. Fixture proof ends at renderer-host IPC; it does not prove a third-party extension or live engine path.

## Web-access runtime inventory (Phase 4)

| Runtime capability | Generic GUI route | Source evidence | Boundary / exclusion |
|---|---|---|---|
| Open curator | Composer runtime command `/websearch [queries]` or registered runtime shortcut | `packages/web-access/web-search-command.ts`; `packages/web-access/web-search-features.ts`; command and shortcut catalog bridge in `packages/coding-agent/src/modes/interactive-engine/remote-command-catalog.ts` | The extension opens its own curator browser/Glimpse window. Protocol v2 exposes no curator-server or browser-window host contract, so the Electron renderer does not embed, proxy, or recreate it. |
| Toggle curator workflow | Composer runtime command `/curator [on\|off\|summary-review]` | `packages/web-access/index-heavy.ts` | The extension persists its own config. The GUI has no config RPC and does not read, write, or render web-access config, API keys, browser cookies, or account details. |
| Browse stored results | Composer runtime command `/search` → generic `ctx.ui.select` then `ctx.ui.notify` | `packages/web-access/index-heavy.ts`; generic v2 dialog bridge `packages/coding-agent/src/modes/rpc/rpc-extension-ui.ts`; `DialogModal.tsx` | Result detail text is extension-owned. No result-store RPC exists, so there is no extension-specific list, delete, or detail panel. |
| Search tool results | Existing transcript generic tool renderer | `packages/web-access/index.ts`; `ToolRenderHost.tsx` | Tool execution remains agent/engine-owned. This slice does not add provider controls or a direct search form. |

The runtime command catalog and shortcuts are discovered from the active engine; the host never hard-codes web-access command names or shortcuts. Fixture coverage proves renderer-host command discovery, composer dispatch, shortcut dispatch, and generic browse dialogs only. It does not prove provider access, real browser launch, persistent storage, OAuth, cookie access, or a live search.


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
