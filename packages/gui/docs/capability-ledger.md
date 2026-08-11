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
| Electron `npm run dev` walkthroughs | manual / e2e (future) | Desktop UX | CI-gated until Phase 5 CI jobs exist |

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
| Composer text + `/` + `@` | `Composer.tsx`, `Autocomplete.tsx` | component source; limited unit coverage | unit | partial — Phase 2 |
| Queue / steer / follow-up chips | Composer queue UI | store `queue_update` tests | unit | partial — dequeue open (Phase 2) |
| Image paste / DnD attachments | Composer + `App.addPastedImages` | `attachments.test.ts`; fake image echo in `engine-client.test.ts` | unit + fake | partial — Phase 0 wire shape proven; real-engine image provider path still open (G3) |
| Sessions list/resume/rename/delete/clone/export/compact/tree | Session picker / tree modal | `session-list.test.ts`, `session-ops.test.ts`, smoke switch | unit + real-engine | partial — fork/share/import open (G8) |
| Models / thinking cycle | Model picker | source + RPC client methods | unit | partial |
| Settings / themes | Settings panel | `settings-store.test.ts`, `theme-loader.test.ts` | unit | partial |
| Auth / trust | Auth + trust dialogs | `project-trust.test.ts` | unit | partial — onboarding open |
| Extension UI host (dialogs/forms/frames) | Modals + `ChromeFrame` | `session-store.test.ts` frame/dialog cases; `ansi` / overlay tests | unit | partial — corpus E2E Phase 3/4 |
| Bundled extensions (workflows/subagents/intercom/MCP/web) | Generic frames only | — | — | open (Phase 4 / M6) |
| CLI machine interfaces (`--print`, `--mode json/rpc`, pipes) | **Excluded** (§3.3) | plan exclusions | docs | excluded |
| Package admin / credential print / multi-window tabs | **Excluded** or deferred (G11) | plan exclusions | docs | excluded |

## Open gates (do not silently close)

| Gate | Topic | Ledger impact |
|---|---|---|
| G3 | Image normalize/resize/`blockImages` authority | Attachment real-engine row stays partial |
| G6 | Default new-chat session persistence | New-chat route notes remain open |
| G7 | Prior-plan `/import`, `/atomic` | No GUI route until runtime `get_commands` inventory |
| G8 | Fork / share / import | Session ops partial |
| G9 | Settings/theme resolution into engine RPC | Settings partial |
| G10 | Protocol identity changes | Protocol stays v2 |

## How to update

1. Add/adjust a row when a capability gains a route or evidence.
2. Promote `partial` → `proven` only with new `real-engine` or `e2e` evidence.
3. Never delete exclusion rows; mark status `excluded` with rationale.
4. Keep this file linked from `packages/gui/README.md`.
