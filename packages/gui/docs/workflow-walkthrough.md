# Workflow GUI walkthrough

The Electron host uses no workflow RPC or workflow-only renderer. Every route stays on protocol-v2 generic contracts.

## Scripted route

`test/electron-phase2.e2e.test.ts` runs this stateful renderer-host fixture path:

1. Composer sends `/workflow demo` through the existing `prompt` RPC; the engine opens a generic `engine_input_form_*` dispatch form.
2. Composer sends `/workflow list` and `/workflow status`; generic inline `engine_custom_*` frames render their runtime output.
3. Runtime-discovered `F2` calls `invoke_shortcut`; the engine opens a generic full-viewport `engine_custom_*` graph frame and a `setWidget` request.
4. A native `extension_ui_request` dialog owns keys. After it closes, graph keys resume; Escape reaches the `handlesCtrlC` frame and its `engine_custom_control hide` update closes the graph.
5. Composer sends `/workflow attach run-a stage-1`; the generic frame receives stage input. `/workflow resume` uses the existing generic `engine_session_picker_*` route.

The fixture accepts only the enumerated `/workflow …` prompt forms for the walkthrough. It emits generic `engine_custom_*`, `engine_input_form_*`, `engine_session_picker_*`, and `extension_ui_request` events; it does not add a workflow RPC.

## Runtime inventory

| Runtime surface | GUI route | Source proof |
|---|---|---|
| Dispatch, list, status, attach | Composer → generic `prompt` RPC with `/workflow …` | `packages/coding-agent/src/core/slash-commands.ts:320-326`; `packages/gui/src/main/engine-client.ts:361-407` |
| Graph | Runtime `get_shortcuts` → `invoke_shortcut` (`F2`) → generic custom frame | `packages/workflows/src/extension/extension-factory.ts:45-56`; `packages/gui/src/main/engine-client.ts:422-441` |
| Graph and stage attach UI | `engine_custom_open/frame/control/terminal/done` → `FrameOverlay` / session store | `packages/coding-agent/src/modes/interactive-engine/protocol.ts:80-112`; `packages/gui/src/renderer/src/store/session-store.ts:872-1006` |
| Dispatch form | `engine_input_form_open/submit/cancel` → `InputFormModal` | `packages/workflows/src/extension/workflow-command-registration.ts:208-255`; `packages/gui/src/renderer/src/components/InputFormModal.tsx` |
| Resume picker | `engine_session_picker_*` → `HostSessionPickerModal` | `packages/workflows/src/tui/workflow-resume-selector.ts:216-333`; `packages/gui/src/renderer/src/components/HostSessionPickerModal.tsx` |

## Exact exclusions

- No `workflow_*` RPC exists in protocol v2; the GUI must not add one. Unknown RPCs fail in `packages/coding-agent/src/modes/rpc/rpc-command-handler.ts:543-546`.
- Workflow stage sessions stay internal. The normal GUI Sessions list calls `list_sessions` without `includeInternal`; stage attach remains `/workflow attach <run> <stage>` inside generic frames.
- This is fixture-E2E renderer-host evidence, not a live workflow engine or DBOS/Postgres proof.
- No extension-specific UI fork, secret display, credential access, or Phase 4 area beyond Workflows is in scope.
