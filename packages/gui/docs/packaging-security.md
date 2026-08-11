# Phase 5 packaging and security review

Reviewed 2026-08-11 from the current GUI source and protocol-v2 host boundary. This is a source-backed review, not a claim that every installer was built.

## Packaging smoke (5.2)

`npm run pack --workspace=@bastani/atomic-gui` runs the GUI build, `electron-builder --dir`, and `scripts/packaged-smoke.mjs`. `pack:directory` is an explicit alias. The smoke resolves the host artifact by platform and executable shape (`scripts/packaged-smoke.mjs:26-66`), starts that actual executable with an isolated temporary user-data directory, preserves only required GUI display variables from the environment, and checks:

- first window title is `Atomic`;
- renderer URL is `file:`;
- the preload bridge answers the `getStatus` IPC call with a state.

The smoke does not pass `--no-sandbox`; it therefore does not disable the Electron sandbox while checking startup. It passed on this host (macOS arm64) with:

```text
packaged smoke passed: packages/gui/release/mac-arm64/Atomic.app/Contents/MacOS/Atomic
```

Exact probes run for this phase:

```sh
npm run pack --workspace=@bastani/atomic-gui
npm run test --workspace=@bastani/atomic-gui
npm run typecheck --workspace=@bastani/atomic-gui
npm run build --workspace=@bastani/atomic-gui
```

The host-only directory result does **not** prove a signed or installable release. DMG, NSIS, and AppImage outputs are not proven here: this environment cannot provide matching Windows/Linux packaging toolchains or signing and notarization credentials. `packages/gui/package.json:40-70` retains the configured targets (DMG + dir on macOS, NSIS + dir on Windows, AppImage + dir on Linux), but this branch makes no cross-platform installer claim.

## Source review and fixes (5.3)

| Area | File:line evidence | Result |
|---|---|---|
| Sandbox | `src/main/index.ts:47-61` | `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false` remain enabled. |
| CSP | `src/renderer/index.html:5-8`, `src/main/index.ts:14-33` | Policy includes `default-src 'self'`, `base-uri 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, `script-src 'self'`, and `connect-src 'self'`. The main process adds the same policy as a response header for the loaded app document so `frame-ancestors` is enforced where response headers apply. Inline styles remain allowed for the current renderer and CodeMirror. |
| IPC bridge | `src/preload/index.ts:12-109`, `src/shared/ipc.ts:300-430` | The preload exposes only the typed allowlist; it does not expose Electron modules or a secret store. |
| IPC sender | `src/main/index.ts:92-105`, `src/main/index.ts:107-330`, `src/main/security.ts:37-50` | Fixed: every invoke handler now checks the current window webContents id and loaded frame URL. Blank and foreign frames are rejected. Regression coverage is in `test/security.test.ts:52-58`. |
| External navigation | `src/main/index.ts:65-74`, `src/main/security.ts:12-35` | Top-level navigation and redirects are limited to the packaged document or a local dev origin. New-window requests are denied; only HTTPS or local HTTP callback URLs reach the system browser. URL userinfo is rejected to avoid forwarding embedded credentials. |
| Credential handling | `src/main/engine-client.ts:79-105`, `src/main/engine-supervisor.ts:44-50`, `src/renderer/src/components/InputFormModal.tsx:42-49`, `src/renderer/src/components/DialogModal.tsx:320-330` | The GUI does not read or persist provider credentials. Auth stays engine-owned; credential, token, key, OAuth prompt, and verification-code inputs use password controls; raw protocol lines are redacted by sensitive field name before renderer delivery. |
| Updates | no `autoUpdater`, update feed, download, or install handler under `src/main`; `packages/gui/package.json:40-70` | No update behavior is implemented or implied. Users must obtain a new signed release through the release channel. |
| Packaging config | `packages/gui/package.json:40-70`, `scripts/packaged-smoke.mjs:24-83` | Directory smoke is host-runnable and now handles electron-builder's platform-specific directory names and GUI display environments. No signing identity or notarization config is present. |

Focused regression probe:

```sh
npm exec --workspace=@bastani/atomic-gui -- vitest --run --config vitest.config.ts test/security.test.ts
```

It passed with 7 tests. The focused form regression (`test/input-form-security.test.tsx`) and OAuth dialog regression (`test/dialog-modal.test.tsx`) also passed. The full GUI suite passed with 26 files and 134 tests; typecheck and build passed as separate probes.

## Exact remaining risks

1. **Engine authority:** `src/main/engine-client.ts:102-105` inherits the host environment and the engine can execute project tools by design. A malicious project, extension, or provider response remains outside the renderer sandbox threat model. The GUI does not filter engine commands or tool output.
2. **Key-based redaction:** `src/main/security.ts:52-69` redacts known sensitive field names, not secret values hidden in ordinary fields. Raw-log output should not be used for sensitive troubleshooting.
3. **Credential backend:** credentials remain engine-owned. This review does not prove the engine's OS backend, file permissions, OAuth provider behavior, or logout erasure. The GUI has no credential vault.
4. **Unsigned local artifact:** the tested macOS directory artifact is unsigned. Release signing, notarization, installer metadata, and tamper/update verification remain release-process work.
5. **No updater:** there is no update feed or signature verification path. A future updater must verify signed artifacts before install; this branch makes no silent-update safety claim.
6. **Platform limits:** only the macOS arm64 directory artifact was started. Windows NSIS, Linux AppImage, DMG installation, signing, notarization, and platform-specific runtime behavior remain untested.
