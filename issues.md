# Open implementation issues

- Native Electron long-transcript acceptance is still a manual gate. The real
  engine imports and pages 10,000 entries successfully, but the opt-in
  Playwright/Electron confirmation harness is nondeterministic: confirmation
  activation can leave the React dialog mounted and the renderer hydration path
  can exceed the test budget. Do not promote the capability-ledger row until a
  desktop walkthrough records native scroll and text selection.
- The focused fixture Electron session fork/import test timed out locally while
  waiting for its durable transcript update. The deterministic engine-client,
  renderer, and real-engine smoke suites remain green; reproduce the fixture
  timeout before changing the engine protocol.
