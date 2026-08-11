# Subagents walkthrough

The Electron GUI hosts subagents through the existing interactive-engine v2
contract. It does not add a subagent IPC API or a subagent-only renderer.

## Run a background subagent

1. Start the engine in the GUI.
2. Ask Atomic to delegate suitable work in the composer. The installed
   subagents extension owns agent selection and execution.
3. When the extension starts an async job, its generic `ctx.ui.setWidget`
   updates appear below the composer. The widget shows the extension's current
   background state, agent name, and activity. Updates replace the same widget
   key, so completed state replaces running state.
4. Read the final result in the normal transcript and use the same session
   controls as any other engine output.

The renderer does not interpret subagent state. It renders ANSI widget lines
from the engine as generic widgets.

## Runtime inventory

| Runtime feature | Source-backed route | GUI result |
|---|---|---|
| Background status | `packages/subagents/src/tui/render-widget.ts` builds an async-agent component factory and calls `ctx.ui.setWidget(..., { placement: "belowEditor" })` | `rpc-extension-ui.ts` routes the factory to `customUi.setWidget`; `engine-custom-ui.ts` emits `engine_custom_open`; `FrameRenderHost.tsx` requests `engine_custom_render`; `session-store.ts` stores returned `engine_custom_frame` lines and `Widgets.tsx` renders them below the composer |
| Start / background selection | `packages/subagents/src/extension/index.ts` registers the `subagent` tool; `packages/coding-agent/src/core/slash-commands.ts` inventories `/run` and `/parallel` | Existing prompt/tool path only; the GUI adds no launch RPC |
| Runtime control | `packages/subagents/src/extension/schemas.ts` defines tool actions `status`, `interrupt`, and `resume` | No direct host control: v2 exposes no subagent-job inventory or control RPC |
| Global cancellation | `packages/coding-agent/src/modes/rpc/rpc-types.ts` defines `abort` | Existing **Abort** cancels current engine work. It is not presented as a per-subagent interrupt control. |

## Exact exclusions

- No subagent-specific window, panel, IPC channel, RPC, or renderer state.
- No per-job **Status**, **Interrupt**, or **Resume** buttons. Their tool
  actions are extension/model operations, while protocol v2 gives the host no
  job IDs, capability flags, or safe dispatch route.
- No expansion or graph controls for component-factory widgets: protocol v2 exposes rendered lines and generic frame input only; it exposes no subagent-specific action schema or safe job-control dispatch.
- Widget state clears before transcript hydration on a session switch. The GUI does not wait for deferred engine widget cleanup.
- No claim that the fixture proves live providers or a third-party extension.
- No credentials, auth state, prompts, artifacts, or raw child output are
  copied into GUI-specific storage.

## Scripted renderer-host proof

`packages/gui/test/electron-phase2.e2e.test.ts` starts a protocol-v2 fixture.
The fixture emits `engine_custom_open` with a `widgetKey`, waits for the
renderer host's `engine_custom_render`, then returns running and completed
`engine_custom_frame` lines after a generic invalidation. The test verifies one
below-editor widget updates. A second fixture test switches sessions without an
engine cleanup event and verifies the widget detaches before async hydration.
This is renderer-host E2E evidence only.
