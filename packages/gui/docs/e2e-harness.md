# Electron E2E harness

`test/electron-phase2.e2e.test.ts` builds then launches `out/main/index.js` with Playwright's Electron launcher. It asserts renderer-visible ready state and CodeMirror focus in the sandboxed Electron host.

The test uses a temporary protocol-v2 fixture. It is **not** real-engine evidence and does not prove queue, fork/import, tree, or compaction semantics.

## Blocked real-engine Phase 2 proof

The attempted real-engine suite used the workspace CLI with a local OpenAI-compatible test peer. Electron launched and reached `ready`, but the engine then reported:

```text
Error: Failed to load extension ".../packages/subagents/src/extension/index.ts":
Failed to load extension: Cannot find native binding.
npm has a bug related to optional dependencies
```

The required GUI test command then failed in existing `real-engine-smoke.test.ts`: engine children exited after startup (`TypeError: Cannot read properties of null (reading 'stdin')` in `src/main/engine-client.ts:625`). The real prompt queue could not remain alive long enough to prove dequeue/pause/resume; the same fault blocks durable fork/import, tree navigation/edit-resubmit, and a compaction boundary in the launched renderer.

Do not mark those Phase 2 capabilities as E2E until a runnable real CLI environment exists. The fixture harness remains useful for Electron launch and renderer focus regression coverage.
