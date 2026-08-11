# Electron E2E harness

`test/electron-phase2.e2e.test.ts` builds and launches `out/main/index.js` with Playwright Electron. Each run uses a fresh `--user-data-dir`, `ATOMIC_CODING_AGENT_DIR`, cwd, and stateful protocol-v2 fixture; it removes them after the test. Launch has a 15-second bound and checks that the built main exists.

## Renderer-host fixture coverage

The fixture rejects unknown commands and sends protocol-v2 shapes: `engine_request_accepted`, `queue_update` with `steering`/`followUp`, `get_tree.data.tree` nested `entry`/`children`, and `set_label`.

It proves renderer-visible Electron flows for:

- queue chips, pause via Abort, ordinary-submit resume, and dequeue restoration;
- fork and import, nonempty durable transcript refresh, active-leaf refresh, and durable tree labels;
- tree navigation restoring CodeMirror focus, keyboard edit/resubmit, and a durable compaction boundary.

This is Electron renderer-host fixture evidence, not real-engine evidence. It does not prove an Atomic CLI/provider running those operations in an Electron window. `real-engine-smoke.test.ts` remains the separate engine-process proof; real-engine Electron E2E remains open. No repo-wide real-engine blocker is claimed here.
