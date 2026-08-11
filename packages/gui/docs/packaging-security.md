# Phase 5 packaging and security review

Reviewed 2026-08-11 from the current GUI source and protocol-v2 host boundary.
This is a source-backed review, not a claim that every installer was built.

## Packaging smoke (5.2)

`npm run pack --workspace=@bastani/atomic-gui` now builds the app, asks
`electron-builder` for a directory artifact (`--dir`), and runs
`scripts/packaged-smoke.mjs`. The smoke check finds the host-platform Electron
executable, starts it with an isolated temporary user-data directory, and
asserts all of the following:

- the first window title is `Atomic`;
- the packaged renderer has a `file:` URL; and
- the preload exposes the typed `window.atomicGui` bridge.

This was run successfully on macOS arm64. The check starts the executable inside
`Atomic.app/Contents/MacOS` rather than trying to execute the `.app` directory.
`pack:directory` is an explicit alias for the same check.

The host-only directory result does **not** prove a signed or installable
release. DMG, NSIS, and AppImage outputs are not proven here: this environment
cannot provide the matching Windows/Linux packaging toolchains or signing and
notarization credentials. `dist` retains electron-builder's configured targets
(DMG + dir on macOS, NSIS + dir on Windows, AppImage + dir on Linux), but no
cross-platform artifact claim should be inferred from this branch.

## Source review and fixes

| Area | Evidence | Result |
|---|---|---|
| Sandbox | `src/main/index.ts` `webPreferences`: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` | Kept. The renderer has no Node or Electron module access. |
| CSP | `src/renderer/index.html` | Hardened the existing policy with `base-uri 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, and `form-action 'none'`. Inline styles remain allowed because the current renderer and CodeMirror use them. |
| IPC bridge | `src/preload/index.ts`, `src/shared/ipc.ts` | Kept the allowlisted, typed `contextBridge` surface. The bridge sends no Electron module or secret store into the renderer. |
| External navigation | `src/main/security.ts`, `src/main/index.ts`, `DialogModal.tsx` links | Fixed: top-level navigation is limited to the packaged document or local dev origin; `target=_blank` requests are denied as windows and safe HTTPS (or local HTTP callback) URLs open in the system browser. Other schemes and remote HTTP are denied. |
| Credential handling | `engine-client.ts`, `engine-bootstrap.ts`, `InputFormModal.tsx`, `AuthPanel.tsx` | The GUI does not read or persist provider credentials. The unused GUI API-key bootstrap path was removed. Secret-looking input fields remain password inputs and values are sent only to the engine's existing auth protocol. Raw protocol log lines are redacted by sensitive field name before renderer delivery. |
| Updates | no `autoUpdater`, update feed, download, or install handler in `src/main` or `package.json` | No update behavior is implemented or implied. Users must obtain a new signed release through the release channel; silent update safety is not a claim. |
| Packaging config | `package.json` `build` field | Directory packaging is smoke-tested on the host. Installer targets are declared but remain unproven under this environment. No signing identity or notarization config is present. |

Focused regression coverage is in `test/security.test.ts`; the packaged startup
check is `scripts/packaged-smoke.mjs`.

## Remaining risks

1. **IPC sender trust:** Electron handlers currently rely on the sandboxed,
   navigation-locked window and do not independently validate every invoke
   sender. A future renderer navigation or a newly added window must add sender
   validation before exposing more privileged commands.
2. **Engine trust boundary:** the engine child inherits the host environment and
   can execute project tools by design. A malicious project, extension, or
   provider response remains outside the renderer sandbox threat model. The GUI
   does not attempt to filter engine commands or tool output.
3. **Raw-log redaction is key-based:** unknown secret values embedded in ordinary
   fields are not detectable. The raw log is opt-in, but it should not be used
   for sensitive troubleshooting.
4. **Credential storage belongs to the engine:** this GUI review does not prove
   the OS backend, file permissions, OAuth provider behavior, or logout erasure
   used by the engine. No GUI-specific credential vault or update signer exists.
5. **Unsigned local artifact:** the macOS directory artifact built in this
   environment is unsigned. Release signing, notarization, installer metadata,
   and per-platform tamper/update verification remain release-process work.
