# Atomic GUI Parity Continuation Plan

| Field | Value |
|---|---|
| Status | Draft — Phase 0 gates G1/G2/G4/G5 resolved |
| Created | 2026-08-11 |
| Repo | `atomic-ui-fork` |
| Focus package | `packages/gui` (`@bastani/atomic-gui`) |
| Supersedes / extends | `specs/2026-08-08-electron-gui-plan.md` |
| Compatibility posture | Preserve current GUI, IPC, engine, prompt, session, attachment, trust, and extension behavior. **Ask before implementing anything breaking.** |

## 1. Executive summary

Continue the Electron GUI until it reaches **100% practical interactive-host parity** with the TUI: a user can complete every supported interactive Atomic workflow from the GUI without needing the terminal, while the engine child remains the sole owner of agent loop, extensions, tools, sessions, models, and config semantics.

Current state (2026-08-11):

- `main` matches `origin/main` at `1d5d6855` (“Add pasted image attachments to GUI prompts”).
- Unstaged local work extends paste attachments with drag-and-drop in three files.
- GUI tests pass (**45/45**). GUI typecheck is red.
- Prior plan M0 is done; M1–M3 mostly done with documented gaps; M4–M5 partial; M6–M7 not started.

**Start here:** finish and stabilize the in-progress image attachment path, clear typecheck without behavior changes, then work through core interactive parity, extension-host parity, bundled-extension walkthroughs, and release readiness.

## 2. Context and motivation

### 2.1 Why continue now

The original plan (`specs/2026-08-08-electron-gui-plan.md`) established the architecture and milestone map. Substantial host surface already exists, but “mostly done” labels overstate exit criteria. The live worktree has unfinished attachment work and a red typecheck gate. A fresh plan is needed to:

1. Preserve and complete the local attachment slice before it drifts.
2. Re-baseline delivered vs remaining against source and tests, not milestone slogans.
3. Define auditable acceptance for **100% practical parity**.
4. Sequence work so stability gates come before feature expansion and release.

### 2.2 Architectural contract (unchanged)

The GUI is a host for the interactive-engine child:

- Protocol: interactive-engine JSONL **v2** via RPC bootstrap (`packages/gui/src/main/engine-client.ts`).
- Agent loop, extensions, tools, sessions, models stay in the engine.
- GUI replaces only the terminal compositor.
- Config surface remains `~/.atomic/agent/` and project `.atomic/` — no parallel system.
- Package stays private / not published inside `@bastani/atomic`.

### 2.3 Current worktree snapshot

| Item | Evidence |
|---|---|
| Branch | `main...origin/main` (no divergence) |
| HEAD | `1d5d6855 Add pasted image attachments to GUI prompts` |
| Unstaged | `packages/gui/src/renderer/src/components/Composer.tsx` (+17/−1) |
| | `packages/gui/src/renderer/src/styles.css` (+6) |
| | `packages/gui/test/engine-client.test.ts` (+14/−1) |
| Tests | `npm run test --workspace=@bastani/atomic-gui` → 13 files, 45 tests passed |
| Typecheck | `npm run typecheck --workspace=@bastani/atomic-gui` → failing |
| Build | `npm run build --workspace=@bastani/atomic-gui` → passed (does not replace typecheck) |

## 3. Definition of done: 100% practical parity

### 3.1 Definition

The GUI reaches **100% practical parity** when a user can complete every supported **interactive** Atomic workflow from the GUI with the same engine/session/configuration effects as the TUI, without needing the TUI.

Native controls may replace terminal selectors, but they must preserve:

- engine semantics and cancellation
- trust and auth outcomes
- prompt / queue / attachment behavior
- session JSONL and tree semantics
- extension `ctx.ui.*` contracts

### 3.2 Per-capability acceptance (all five required)

For each interactive capability:

1. **GUI entry point** — native control, documented shortcut, or slash command in the composer.
2. **Same engine outcome** — same RPC/event/extension protocol result as the TUI.
3. **Automated proof** — protocol/unit test and/or Electron E2E with real or deterministic engine.
4. **Manual walkthrough** — where browser/OS behavior matters (clipboard, focus, DnD, OAuth).
5. **No silent contract change** — no unapproved change to CLI/TUI behavior, IPC, engine state, prompts, session JSONL, or attachment payloads.

### 3.3 Deliberate exclusions (not parity blockers)

These remain CLI-owned unless the user explicitly expands scope. Do not remove or silently change them.

| Exclusion | Rationale |
|---|---|
| `--print`, `--mode json`, `--mode rpc`, piped stdin/stdout automation | Machine interfaces; GUI cannot replace exit codes / JSONL contracts |
| Launch flags (`--session-dir`, `--no-session`, `--tools`, `--extension`, `--system-prompt`, …) | Process launch config; optional later launch-profile UI must not invent semantics |
| `atomic install/remove/update/list/config` package admin | Changes code/trust; needs separate security design |
| `atomic auth print-api-key` / `print-bearer-token` | Script credential output; dangerous in GUI |
| Terminal-only job control / kitty image protocol / terminal cursor choreography | Map to desktop focus, native images, window behavior instead |
| Multi-window tabs/splits, remote/web deploy, GUI-only agent features | Parity-plus; prior plan treats as non-blocking |

## 4. Delivered / in-progress / remaining matrix

Status keys:

- **Delivered** — source + tests/docs support the claim
- **In progress** — partial source; exit criteria not met
- **Remaining** — little or no GUI evidence
- **Open decision** — needs user gate before implementation

### 4.1 Milestone rollup

| Milestone | Status | Summary |
|---|---|---|
| **M0** Skeleton + engine bridge | **Delivered** | Engine child, protocol handshake, sandboxed window, IPC bridge |
| **M1** Core chat parity | **In progress** | Core transcript kinds + footer/usage/working; missing virtualization, dedicated custom/skill kinds, full native image/diff proof |
| **M2** Input system | **In progress** | Composer, `/`+args, `@`, history, bash, steer/follow-up/abort, queue chips; attachments incomplete; full keymap / external editor / paste markers / path Tab / dequeue open |
| **M3** Sessions | **In progress** | Resume/search/sort/rename/delete/clone/export/compact/tree/list; fork/share/import and full tree edit-resubmit open |
| **M4** Models / settings / auth / theme | **In progress** | Model picker, cycle model/thinking, theme loader (user+builtin), auth, trust; full settings tree, scoped models, fast mode, project themes, onboarding open |
| **M5** Extension UI host | **In progress** | Dialogs, forms, host session picker, ANSI frames, chrome slots, key-release, scroll; dialog timeouts, focus/key routing E2E, extension corpus open |
| **M6** Bundled-extension walkthroughs | **Remaining** | Workflows, subagents, intercom, MCP, web-access GUI scenarios not started |
| **M7** Productization | **Remaining** | CI, packaging smoke, a11y/perf/security release gates, signing/updates not started |

### 4.2 Detailed capability ledger

| Capability | Status | Evidence / targets | Remaining work |
|---|---|---|---|
| Engine lifecycle + streaming | Delivered (needs real-engine smoke) | `engine-client.ts`, `engine-supervisor.ts`, `engine-client.test.ts` | Real-engine start/prompt/abort/restart/version-mismatch smoke; recover without losing sent message |
| Transcript kinds | In progress | `Transcript.tsx`, `session-store.ts`, `ToolRenderHost.tsx` | Virtualization; custom/skill entry fidelity; image/diff rendering proof |
| Composer text + completion | In progress | `Composer.tsx`, `Autocomplete.tsx` | Tab path completion; external editor; large-paste markers; configurable `app.*` keybindings |
| Queue / steer / abort | In progress | `App.tsx`, queue chips in `Composer.tsx` | Queue chips are display-only; dequeue; pause semantics parity |
| Image paste | In progress | Committed path in `App.tsx` + `ipc.ts` | Wire `type: "image"`; policy/normalize parity; typecheck; real engine proof |
| Image drag/drop | **In progress (local unstaged)** | `Composer.tsx`, `styles.css`, test echo | Finish DnD; renderer tests; payload contract; pending-read race |
| Sessions list/resume/ops | In progress | `SessionPicker.tsx`, `session-list.ts`, `session-ops.ts`, engine `list_sessions` | Fork/share/import; tree label/fold/edit-resubmit |
| Models / thinking | In progress | `ModelPicker.tsx`, `App.tsx` | Scoped models, fast mode |
| Settings / themes | In progress | `SettingsPanel.tsx`, `settings-store.ts`, `theme-loader.ts` | Full settings tree; project themes; live reload; engine-owned resolution decision |
| Auth / trust | In progress | `AuthPanel.tsx`, `TrustDialog.tsx` | Onboarding; full OAuth cancellation/edge coverage |
| Extension UI host | In progress | frames, dialogs, forms, chrome slots, `key-encode.ts` | Dialog timeouts; focus matrix; generic extension corpus E2E |
| Bundled extensions | Remaining | docs mark M6 not started | Workflow/subagent/intercom/MCP/web walkthroughs |
| A11y / perf / packaging / CI | Remaining | sandbox flags exist; no GUI CI found | Keyboard-only audit; long transcript; pack smoke; CI gates |

### 4.3 Prior-plan protocol items now present

These original additive gaps are partly closed:

| Item | Evidence |
|---|---|
| `list_sessions` RPC | `packages/coding-agent/src/modes/rpc/rpc-command-handler.ts`; GUI `engine-client.ts` |
| Command-argument completion + extension shortcuts | RPC handlers + GUI consumers |
| Remote chrome frames / custom editor slots | protocol + `App.tsx` chrome mounting |
| Host forms + host session picker | protocol + GUI modals |

Still unverified without real-extension E2E: theme/settings engine introspection as a host-mode contract, and full frame fidelity under third-party extensions.

## 5. Attachment stability baseline (Phase 0 target)

### 5.1 Proven facts

1. **Committed paste path** reads image `File`s as data URLs and stores `{ data, mimeType }` (`App.tsx`).
2. **Unstaged DnD** accepts `image/*` drops, shows drop target styles, reuses paste handler (`Composer.tsx`, `styles.css`).
3. **Removal chips** exist; failed prompt restores images (`App.tsx`).
4. **Fake-engine test** proves EngineClient forwards the supplied image payload echo — not browser DnD, not real provider delivery.
5. **Typecheck is red** with failures including:
   - `engine-client.ts` — `SessionListItem` usage/import
   - `engine-supervisor.ts` — `listSessions` options mismatch
   - `App.tsx` — `FileReader.result` narrowing inside attachment callback
   - `ChromeFrame.tsx` — unsafe optional callback calls
6. Unstaged diff does **not** touch most typecheck failure sites (except the attachment path’s TS narrowing).

### 5.2 Contract gaps (must resolve before calling attachments done)

| Gap | Detail | Gate |
|---|---|---|
| Missing `type: "image"` | Engine `ImageContent` is `{ type: "image", mimeType, data }`. GUI `PromptImage` omits `type`. | Fix to match engine wire form **or** get explicit engine-compat decision |
| Image policy bypass | GUI does not run engine `processImage` (MIME normalize / resize / `blockImages`) | Decide where policy applies; do not invent GUI-only policy |
| Image-only UX mismatch | `App.submit` allows image-only; Send button disables when text is empty | Decide intended UX before changing either side |
| Async reader race | Readers start in a loop with no pending gate; early submit can drop in-flight images | Fix after contract freeze |
| Bash + attachments | `submit` clears attachments then runs `!`/`!!` without images | Confirm intended behavior before changing |
| Non-image drops | Silently ignored | Confirm reject UX vs future file-attachment scope |
| No renderer DnD test | Only fake-engine payload echo exists | Add focused tests |

### 5.3 Attachment done checklist

- [ ] Browser DnD accepts supported images; rejected files have a clear result
- [ ] Payload matches engine `ImageContent` (`type: "image"`, `mimeType`, `data`)
- [ ] MIME/resize/`blockImages` follow the same effective settings contract as other intake
- [ ] Text, image-only (if approved), steer, follow-up preserve attachments through IPC/queues
- [ ] Failed prompt restores text and every attachment
- [ ] Real engine/provider path receives image blocks; session reload retains them
- [ ] Bash-with-attachment behavior has an explicit approved decision
- [ ] `typecheck`, `test`, and `build` for `@bastani/atomic-gui` all pass
- [ ] Manual Electron paste + DnD walkthrough passes

## 6. Compatibility rules

1. **Engine owns truth.** Prefer additive RPC / host UI over reimplementing engine logic in the renderer.
2. **No silent breaks.** Any change to GUI, IPC, engine, prompt, session, attachment, trust, OAuth, or extension behavior requires user approval first.
3. **Preserve local unstaged work** until Phase 0 contract review lands.
4. **Typecheck + tests + real-engine smoke** are release gates; build alone is insufficient.
5. **Do not invent slash commands** from the old plan alone. Verify runtime `get_commands` before treating `/import` or `/atomic` as scope.
6. **Milestone labels are not proof.** Promote status only with the five-point acceptance rule in §3.2.

## 7. Phased execution plan

Each step lists: targets, user outcome, compatibility constraint, validation, done condition.

### Phase 0 — Preserve and finish local attachment work

**Goal:** one tested image path from browser intake → IPC → engine prompt.

| Step | Targets | User outcome | Compatibility | Validation | Done when |
|---|---|---|---|---|---|
| 0.1 Inventory freeze | `Composer.tsx`, `styles.css`, `engine-client.test.ts`, `App.tsx`, `ipc.ts` | No lost DnD work | Do not rewrite unrelated surfaces | `git status`, `git diff` | Diff understood; behavior notes recorded |
| 0.2 Payload decision | `ipc.ts` `PromptImage`, `engine-client.ts` `prompt()` | Correct image blocks on the wire | Prefer exact `ImageContent`; ask before engine changes | Unit + real-engine image prompt | Payload includes `type: "image"` or approved exception |
| 0.3 Typecheck green (no behavior change) | `engine-client.ts`, `engine-supervisor.ts`, `App.tsx`, `ChromeFrame.tsx` | Clean compile | Narrowing/imports/optional calls only | `npm run typecheck --workspace=@bastani/atomic-gui` | Zero errors |
| 0.4 Intake safety | `App.tsx` `addPastedImages` / submit | No lost pending reads; honest failures | Keep restore-on-prompt-failure | New renderer/component tests | Pending gate + reader failure covered |
| 0.5 DnD + paste tests | `Composer` tests + `engine-client.test.ts` | Proven browser + wire paths | Exact payload assertions | `npm run test --workspace=@bastani/atomic-gui` | Paste, DnD, multi-image, reject non-image |
| 0.6 Policy decision | image process / settings | Same effective limits as CLI image intake | Ask before moving policy into engine or changing settings meaning | Manual + settings fixture | Decision recorded; implementation matches |
| 0.7 Manual Electron check | full app | Paste/DnD/remove/mixed/image-only/fail-restore | No provider/session format change | `npm run dev --workspace=@bastani/atomic-gui` | Walkthrough checklist green |

**Phase 0 exit commands:**

```sh
cd /Users/odellsallis/Documents/Sites/atomic-ui-fork
npm run typecheck --workspace=@bastani/atomic-gui
npm run test --workspace=@bastani/atomic-gui
npm run build --workspace=@bastani/atomic-gui
npm run dev --workspace=@bastani/atomic-gui
```

### Phase 1 — Stability and compatibility gates

| Step | Targets | User outcome | Compatibility | Validation | Done when |
|---|---|---|---|---|---|
| 1.1 Real-engine smoke | `engine-client`, supervisor | Reliable start/stream/abort/restart | Protocol v2 unchanged | Scripted smoke against real CLI entry | Version skew fails clearly; restart safe |
| 1.2 Session switch / reload integrity | `session-store`, resume paths | No transcript loss on switch | Session JSONL owned by engine | Store + E2E | Hydration matches leaf |
| 1.3 Capability ledger file | `packages/gui` docs or `specs/` ledger | Visible parity tracker | Docs only | Review | Every interactive command has route/exclusion/evidence columns |
| 1.4 Fake-engine boundary | tests | Clear what unit tests prove | Do not overclaim | Test inventory | Parity claims require real-engine or E2E rows |

### Phase 2 — Core interactive parity (M1–M3 completion)

| Step | Targets | User outcome | Compatibility | Validation | Done when |
|---|---|---|---|---|---|
| 2.1 Transcript completeness | `Transcript.tsx`, `session-store.ts` | All durable/streaming kinds readable | No engine entry rewrite | Fixtures + visual check | custom/skill/system/branch/compaction/tool/bash covered |
| 2.2 Virtualization / long scroll | transcript list | Usable long sessions | Selection/scroll stability | Perf smoke | Long transcript usable |
| 2.3 Composer keymap parity | `Composer.tsx`, keybinding loader | Configured `app.*` bindings work | Read engine/user keybindings; no hardcode-only final state | Key matrix test | Documented bindings routed by focus zone |
| 2.4 External editor + paste markers | composer | Large paste collapse; `$VISUAL`/`$EDITOR` | Match TUI semantics | Manual + unit | Markers expand on submit |
| 2.5 Path Tab completion | autocomplete | Generic path completion | Same engine/fs rules | Unit | Tab path works outside `@` only where TUI does |
| 2.6 Queue dequeue / pause | composer + store | Dequeue and pause match TUI | Keep steer/follow-up meanings | E2E | Chips actionable; restore/pause correct |
| 2.7 Session fork/share/import disposition | sessions UI + RPC | Missing session ops available or explicitly excluded | Engine-owned mutations only; ask before new semantics | E2E + confirmations | Each op has route or approved exclusion |
| 2.8 Tree advanced UX | `TreeNavigator.tsx` | label/fold/edit-resubmit if in TUI scope | Preserve active leaf + compaction boundaries | E2E | Tree parity checklist complete |
| 2.9 Slash-command inventory | runtime `get_commands` | No phantom commands | Verify before implementing old-plan `/import` `/atomic` | Inventory dump | Disposition recorded |

### Phase 3 — Settings, auth, models, extension host (M4–M5 completion)

| Step | Targets | User outcome | Compatibility | Validation | Done when |
|---|---|---|---|---|---|
| 3.1 Full settings surface | `SettingsPanel`, settings store | Edit supported settings with correct precedence | Ask before changing merge authority | Precedence tests | Global/project settings match docs |
| 3.2 Themes | `theme-loader` | Builtin + user + project themes | Same resolution as engine/TUI | Load tests | Project themes work; live reload if TUI has it |
| 3.3 Scoped models + fast mode | model UI | Parity with TUI model controls | Engine RPCs only | UI + RPC tests | State persists correctly |
| 3.4 Onboarding | first-run UI | Trust/auth/model first run | No credential leakage | Manual | First-run path documented |
| 3.5 Dialog timeouts + focus matrix | `DialogModal`, frames | Timeouts and focus recovery | Keep extension event order | E2E focus suite | Modal/frame/editor focus correct |
| 3.6 `ctx.ui.*` corpus | frame/host components | Every prior-plan §1.8 element has a route | Generic frames only; no per-extension forks | Extension fixture pack | Each element tested or approved exclusion |
| 3.7 Key encode / terminal modes | `key-encode.ts`, chrome frames | Legacy + kitty release + scroll modes | Do not break third-party frames | Existing + expanded tests | Corpus green |

### Phase 4 — Bundled-extension walkthroughs (M6)

| Extension area | User outcome | Validation | Done when |
|---|---|---|---|
| Workflows | Dispatch/status/list/graph/stage attach from GUI | Scripted E2E | Walkthrough doc + test pass |
| Subagents | Background status / control visible | Scripted E2E | No TUI required |
| Intercom | Compose/receive | Scripted E2E | Approved gaps documented |
| MCP | Login and tool use host UI | Scripted E2E | OAuth cancellation safe |
| Web access | Curator / browse flows | Scripted E2E | No secret leakage |

Constraint: preserve generic frame contract; no extension-specific GUI fork that bypasses protocol.

### Phase 5 — Release readiness (M7)

| Step | Targets | Done when |
|---|---|---|
| 5.1 CI | GUI test + typecheck + build jobs | Required checks on GUI paths |
| 5.2 Pack smoke | `pack`/`dist` per supported OS | Installable artifact starts |
| 5.3 Security review | sandbox, CSP, IPC bridge, external nav, credentials, updates | Written review + fixes |
| 5.4 Accessibility | keyboard-only + labels + focus | Audit checklist green |
| 5.5 Performance | long transcript + fast stream | Budget recorded and met |
| 5.6 Docs | `packages/gui/README.md`, `packages/coding-agent/docs/gui.md` | Supported scope, exclusions, recovery, GUI-vs-CLI boundary current |

## 8. Decision gates

| # | Decision | Status | Resolution |
|---|---|---|---|
| G1 | Approve interactive-host parity boundary + exclusions in §3.3 | **Resolved 2026-08-11** | Approved as written |
| G2 | Image payload shape | **Resolved 2026-08-11** | GUI emits full `ImageContent`: `{ type: "image", mimeType, data }` |
| G3 | Where image normalize/resize/`blockImages` runs for GUI files | Open | Prefer engine-owned path; ask if RPC must change |
| G4 | Image-only prompts | **Resolved 2026-08-11** | Allowed; enable Send when images are attached |
| G5 | Bash (`!`/`!!`) with pending attachments | **Resolved 2026-08-11** | Run bash without attaching images; keep/restore pending images and show a short warning (do not silently discard) |
| G6 | Default new-chat session persistence (`--no-session` vs persist) | Open | Ask; do not change quietly |
| G7 | Disposition of prior-plan-only `/import`, `/atomic` | Open | Verify runtime commands first |
| G8 | Fork / share / import session ops | Open | Implement via engine RPCs only |
| G9 | Move settings/theme/trust resolution fully into engine RPC | Open | Ask before moving |
| G10 | Protocol identity changes (`hostInfo`, `ctx.mode`, version bump) | Open | Ask + migration plan |
| G11 | Package manager UI / multi-window tabs | Open | Defer until after parity |
| G12 | **Any breaking behavior** | Standing rule | Always ask first |

## 9. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Unstaged DnD work overwritten | Lost progress | Phase 0 first; small focused commits |
| Fake-engine tests overclaim parity | False “done” | Capability ledger requires real-engine/E2E evidence |
| Missing `type: "image"` breaks providers | Attachments look fine, fail in production | Contract test against real engine content |
| GUI hardcodes TUI behavior and drifts | Double maintenance | Engine owns semantics; additive RPC only |
| Keybinding/focus fights browser defaults | Broken shortcuts / trapped focus | Focus zones + keyboard audit |
| Session/trust data loss | User harm | Engine-owned mutations; confirm destructive actions |
| OAuth/credential exposure | Security incident | Sandbox, narrow bridge, no renderer secret logs |
| Packaging only works locally | Bad releases | CI pack smoke per OS |
| Scope creep into package admin / tabs | Delays parity | Gates G11–G12 |

## 10. First working session (concrete)

Do this next, in order:

```sh
cd /Users/odellsallis/Documents/Sites/atomic-ui-fork

# 1. Preserve context
git status --short --branch
git diff -- packages/gui/src/renderer/src/components/Composer.tsx \
  packages/gui/src/renderer/src/styles.css \
  packages/gui/test/engine-client.test.ts
git show --stat --oneline 1d5d6855

# 2. Read the attachment path
# - packages/gui/src/renderer/src/components/Composer.tsx
# - packages/gui/src/renderer/src/App.tsx (submit + addPastedImages)
# - packages/gui/src/shared/ipc.ts (PromptImage / PromptRequest)
# - packages/gui/src/main/engine-client.ts (prompt)
# - packages/coding-agent/src/modes/rpc/rpc-types.ts (ImageContent on prompt)

# 3. Reproduce gates
npm run typecheck --workspace=@bastani/atomic-gui
npm run test --workspace=@bastani/atomic-gui
```

Then implement **only Phase 0** (gates G1/G2/G4/G5 already resolved):

1. Align image payload with engine `ImageContent` — add `type: "image"` (**G2**).
2. Fix typecheck errors without behavior changes.
3. Enable Send when images are attached; keep image-only submit (**G4**).
4. On `!`/`!!`, keep pending images and warn; do not silently discard (**G5**).
5. Add pending-read safety and renderer DnD/paste tests.
6. Manual Electron verification.
7. Commit Phase 0 as a focused attachment-stability change set.

Only after Phase 0 exit, open Phase 1 stability smoke and the capability ledger.

### Suggested first commit series (after gates)

1. `fix(gui): clear typecheck errors without behavior changes`
2. `fix(gui): send ImageContent-shaped attachment payloads`
3. `feat(gui): finish composer image drag-and-drop intake`
4. `test(gui): cover paste/drop attachment paths`

(Adjust messages to repo convention; do not combine with unrelated milestone work.)

## 11. Final parity checklist

- [x] User approved parity boundary and exclusions (**G1**)
- [ ] Phase 0 attachment checklist complete (§5.3)
- [ ] GUI typecheck, tests, and build pass
- [ ] Real engine confirms handshake, prompt, stream, abort, restart, version mismatch
- [ ] Every documented interactive CLI command has a tested GUI route or approved exclusion
- [ ] Composer matches TUI for text, images, completion, history, bash, queueing, abort, dequeue, external editor
- [ ] Session actions preserve JSONL, active leaf, compaction, branch, export, internal-workflow filtering
- [ ] Settings, themes, models, auth, trust match documented precedence
- [ ] Every `ctx.ui.*` capability has generic contract coverage + real-extension test
- [ ] Bundled workflows, subagents, intercom, MCP, web-access walkthroughs pass
- [ ] Keyboard-only, a11y, focus recovery, long transcript, fast stream checks pass
- [ ] GUI CI, packaging smoke, security review, and docs are complete

## 12. Evidence index

| Source | Path |
|---|---|
| Prior plan | `specs/2026-08-08-electron-gui-plan.md` |
| GUI package status | `packages/gui/README.md` |
| User-facing GUI docs | `packages/coding-agent/docs/gui.md` |
| CLI usage / sessions / keybindings / settings | `packages/coding-agent/docs/usage.md`, `sessions.md`, `keybindings.md`, `settings.md` |
| Engine protocol | `packages/coding-agent/src/modes/interactive-engine/protocol.ts` |
| RPC image contract | `packages/coding-agent/src/modes/rpc/rpc-types.ts` |
| GUI IPC | `packages/gui/src/shared/ipc.ts` |
| Research: prior-plan trace | workflow artifact `branch-01-prior-plan-trace.md` (run `19c584ae-…`) |
| Research: attachment stability | workflow artifact `branch-02-attachment-stability.md` |
| Research: parity roadmap | workflow artifact `branch-03-parity-roadmap.md` |

## 13. Open questions for the user

### Resolved (2026-08-11)

1. **G1** — Practical interactive-host parity + listed exclusions **approved**.
2. **G2** — GUI emits full `ImageContent` including `type: "image"`.
3. **G4** — Image-only prompts allowed; enable Send when images exist.
4. **G5** — Bash with pending images: warn and keep images (do not silently discard).

### Still open

1. **G3** — Image normalize/resize/`blockImages` authority for GUI-originated files.
2. **G6** — Default session persistence for new GUI chats.
3. **G7/G8** — Session fork/share/import and any prior-plan-only commands after runtime inventory.
4. **G9/G10** — Whether settings/theme authority or protocol identity should move.

---

*This document is the working continuation plan. Update milestone tables and the capability ledger as phases exit. Do not mark M1–M7 complete from unit tests alone.*
