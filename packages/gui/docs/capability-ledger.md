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
| `test/electron-phase2.e2e.test.ts` | fixture E2E | Electron renderer-host queue/session/tree, Phase 3 focused-frame/dialog routing, and Phase 4 generic workflow, subagent, Intercom, and MCP prompt/form/list/status/graph/attach/widget/compose/receive/frame/tool routes | Atomic CLI/provider semantics; this fixture is not a real-engine extension claim |

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
| Bundled extensions — Workflows | Composer `prompt` (`/workflow …`), runtime F2 shortcut, generic input form/session picker/custom frame routes | `docs/workflow-walkthrough.md`; `electron-phase2.e2e.test.ts` (“workflow routes stay on generic prompts and frames”) | fixture E2E + docs | proven — generic renderer-host workflow walkthrough only; no live DBOS/engine claim |
| Bundled extensions — subagents | Generic below-editor custom widget; existing engine **Abort** remains global | `docs/subagents-walkthrough.md`; `electron-phase2.e2e.test.ts` (custom open → render → frame status updates, cancelled replacement preservation, and session-switch widget cleanup); source inventory in `packages/subagents/src/tui/render-widget.ts`, `packages/coding-agent/src/modes/rpc/rpc-extension-ui.ts`, and `modes/interactive-engine/engine-custom-ui.ts` | fixture E2E + docs | partial — background component-factory status updates render through generic `engine_custom_*` frames; widgets clear on session switch without awaiting engine cleanup. V2 exposes no subagent-job list/status/interrupt/resume RPC, so the GUI has no per-job controls. |
| Bundled Intercom | Runtime `/intercom` command and `alt+m` shortcut → generic `engine_custom_*` session-picker/compose frames; incoming `intercom_message` custom card | `electron-phase2.e2e.test.ts` (“Intercom…”); `session-store.test.ts` visible custom-message entry; source inventory below | fixture E2E + unit + source | partial — renderer-host compose/receive wiring is proven. This does not prove a live broker, peer, or extension session. |
| MCP walkthrough | `/mcp`, `/mcp setup`, and `/mcp-auth` use generic `engine_custom_*` frames; MCP and runtime-exposed direct tool calls use generic tool events/rendering | `electron-phase2.e2e.test.ts` validates generic frame Ctrl+C forwarding and complete `engine_tool_render` requests for proxy plus direct tool fixtures; `mcp-panel-oauth-cancel.test.ts` covers real panel cancellation; `packages/mcp/commands.ts`; `packages/mcp/index.ts`; `agent-events.ts` | fixture E2E + source + unit | partial — renderer-host frame and tool presentation are proven. Real configured-server OAuth and calls remain engine-owned and unproven. |
| Bundled web-access curator / browse | Runtime command catalog → Composer (`/websearch`, `/curator`, `/search`); runtime shortcut route; generic `DialogModal` | `electron-phase2.e2e.test.ts` (“runtime web curator and stored-search flows stay generic”); `packages/web-access/index.ts`, `index-heavy.ts`, `web-search-command.ts` | fixture E2E + source inventory | partial — curator opens its own runtime browser/Glimpse surface; stored-result browse uses generic `ctx.ui.select`/`notify`. No web-specific renderer, provider setup, cookie access, or secret display is added. |
| Other bundled extensions (remaining live-provider/broker surfaces) | Generic frames only | Phase 4 rows and inventories above | docs | open — live DBOS/provider execution, broker peers, configured MCP servers, and provider-backed web access remain engine-owned or excluded |
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

## Phase 4 Workflows inventory (2026-08-11)

The GUI routes workflow dispatch, list, status, graph, and stage attach only through runtime-discovered slash commands, shortcuts, and generic `ctx.ui.*` frames. See [`workflow-walkthrough.md`](workflow-walkthrough.md) for source-backed route mapping, fixture evidence, and exact exclusions. No `workflow_*` RPC or workflow-only renderer is permitted.

## Phase 4 Intercom runtime inventory (2026-08-11)

| Runtime surface | GUI disposition | Source evidence |
|---|---|---|
| `/intercom` | The engine owns activation. The GUI sends the runtime command through the existing composer and mounts its `ctx.ui.custom` picker and compose surfaces through generic `engine_custom_*` frames. | `packages/intercom/overlay.ts`; `packages/intercom/index.ts`; `packages/coding-agent/src/modes/interactive-engine/protocol.ts` |
| `alt+m` | The GUI reads the existing runtime shortcut inventory and invokes it through `invoke_shortcut`, including while the generic composer is focused; the engine opens the same generic picker. | `packages/intercom/overlay.ts`; `packages/coding-agent/src/modes/rpc/rpc-command-handler.ts`; `src/renderer/src/App.tsx`; `src/renderer/src/components/Composer.tsx` |
| Incoming message card | The GUI accepts the visible live `custom` message lifecycle emitted by `sendMessage`: `message_start` then `message_end`, with `customType: "intercom_message"`, and renders it with the generic transcript card. The engine persists the matching custom-message entry before those events. | `packages/intercom/incoming-message-delivery.ts`; `packages/coding-agent/src/core/agent-session-message-queue.ts`; `src/renderer/src/store/session-store.ts` |
| Tool actions: `list`, `send`, `ask`, `reply`, `pending`, `status` | **Excluded from direct GUI controls.** Protocol v2 exposes no Intercom RPC or broker/session contract. They remain engine tool actions, visible through generic tool/transcript rendering when the engine invokes them. | `packages/intercom/index.ts`; `packages/coding-agent/src/modes/interactive-engine/protocol.ts` |
| Attachments, group selection, peer presence, and live broker verification | **Excluded from this walkthrough.** No typed v2 host contract exposes these values; the GUI must not read broker state, infer peers, or add an Intercom-specific surface. | `packages/intercom/index.ts`; `packages/intercom/overlay.ts`; `packages/coding-agent/src/modes/rpc/rpc-extension-ui.ts` |

The fixture proves only source-shaped renderer-host frames, shortcut invocation, and live incoming-message lifecycle. It does not claim a live Intercom broker or peer session.


## Phase 4 MCP runtime inventory (2026-08-11)

| Runtime capability | GUI route | Evidence / boundary |
|---|---|---|
| MCP panels and OAuth picker | Generic custom frame host (`engine_custom_open`, render, input, dispose) | `/mcp setup`, `/mcp`, and `/mcp-auth` call `ctx.ui.custom` with `handlesCtrlC: true` in `packages/mcp/commands.ts`. `FrameOverlay` forwards Ctrl+C to the focused frame; fixture E2E covers that generic host route. |
| MCP OAuth cancellation and secrets | Engine-owned browser/callback flow; no MCP-specific GUI auth RPC | `mcp-panel.ts` calls the scoped `cancelAuthentication` callback before it closes, and `mcp-auth-flow.ts` aborts, clears owned state, and rejects the owner. OAuth failures use fixed user text and refresh logs no caught error object. `mcp-auth.ts` rejects path-like server names before token storage. The GUI does not read, log, write, or return credentials. |
| MCP proxy and runtime-exposed direct tool use | Generic `tool_execution_*` events → `ToolRenderHost` → `engine_tool_render` | MCP registers the `mcp` proxy plus optional direct tools in `packages/mcp/index.ts`; `agent-events.ts` defines the generic event shapes. The fixture validates every required `engine_tool_render` field and covers proxy plus direct tool fixture events. |
| MCP server configuration, connection, and token storage | **Excluded from GUI authority** | Protocol v2 exposes no MCP-specific config, connection, token, or auth-state RPC. The GUI must not invent one or fork renderer UI by extension. |

Source inventory: `packages/mcp/commands.ts`, `packages/mcp/index.ts`, `packages/mcp/mcp-auth-flow.ts`, `packages/mcp/mcp-auth.ts`, `packages/coding-agent/src/core/extensions/agent-events.ts`, and `packages/coding-agent/src/modes/interactive-engine/protocol.ts`.

## Web-access runtime inventory (Phase 4)

| Runtime capability | Generic GUI route | Source evidence | Boundary / exclusion |
|---|---|---|---|
| Open curator | Composer runtime command `/websearch [queries]` | `packages/web-access/index.ts`; `packages/web-access/web-search-command.ts` | The extension opens its own curator browser/Glimpse window. Protocol v2 exposes no curator-server or browser-window host contract, so the Electron renderer does not embed, proxy, or recreate it. |
| Toggle curator workflow | Composer runtime command `/curator [on\|off\|summary-review]` | `packages/web-access/index.ts`; `packages/web-access/index-heavy.ts` | The extension persists its own config. The GUI has no config RPC and does not read, write, or render web-access config, API keys, browser cookies, or account details. |
| Active Google account | Runtime-discovered `/google-account` stays outside this walkthrough | `packages/web-access/index.ts`; `packages/web-access/index-heavy.ts` | It can emit the active email in an engine-owned tool transcript when browser-cookie access is enabled. The GUI adds no account panel, fixture account branch, cookie route, or secret storage; this remains an explicit PII-sensitive runtime exclusion. |
| Browse stored results | Composer runtime command `/search` → generic `ctx.ui.select` for result then **View details**/**Delete** action | `packages/web-access/index.ts`; `packages/web-access/index-heavy.ts`; generic v2 dialog bridge `packages/coding-agent/src/modes/rpc/rpc-extension-ui.ts`; `DialogModal.tsx` | Result detail text is extension-owned. No result-store RPC exists, so there is no extension-specific list, delete, or detail panel. |
| Search tool results | Existing transcript generic tool renderer → engine-owned remote frames | `packages/web-access/index.ts`; `ToolRenderHost.tsx`; `Transcript.tsx` | Tool execution remains agent/engine-owned. This slice does not add provider controls or a direct search form. |

The runtime command catalog and shortcuts are discovered from the active engine; the host never hard-codes web-access command names or shortcuts. Electron coverage uses a source-backed catalog inventory of all four registered commands, applies Enter completion before command dispatch, follows `/search` through both selects plus cancel, invokes the discovered activity shortcut while the composer has focus, and forwards deterministic lifecycle events for `web_search`, `code_search`, `fetch_content`, and `get_search_content` into generic cards and remote frames. It does not prove provider access, real browser launch, persistent storage, OAuth, cookie access, a live search, or the PII-sensitive `/google-account` transcript branch.


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
