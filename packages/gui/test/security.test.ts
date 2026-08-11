import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
	isAllowedAppNavigation,
	isSafeExternalUrl,
	isTrustedIpcSender,
	redactSensitiveProtocolLine,
} from "../src/main/security.ts";

test("packaged navigation allows only its document and local dev origin", () => {
	const index = "/Applications/Atomic.app/Contents/Resources/app.asar/out/renderer/index.html";
	assert.equal(isAllowedAppNavigation(`file://${index}`, index), true);
	assert.equal(isAllowedAppNavigation("https://attacker.example/", index), false);
	assert.equal(isAllowedAppNavigation("http://127.0.0.1:5173/other", index, "http://127.0.0.1:5173/"), true);
	assert.equal(isAllowedAppNavigation("http://192.168.1.5:5173/", index, "http://192.168.1.5:5173/"), false);
});

test("main window also guards redirect targets", () => {
	const source = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
	assert.match(source, /webContents\.on\("will-redirect"/u);
});

test("packaged smoke preserves GUI display variables and invokes the bridge", () => {
	const smoke = readFileSync(new URL("../scripts/packaged-smoke.mjs", import.meta.url), "utf8");
	assert.match(smoke, /DISPLAY/u);
	assert.match(smoke, /window\.atomicGui\.getStatus\(\)/u);
});

test("external links allow HTTPS and local OAuth callbacks only", () => {
	assert.equal(isSafeExternalUrl("https://accounts.example.test/login"), true);
	assert.equal(isSafeExternalUrl("http://localhost:3000/callback"), true);
	assert.equal(isSafeExternalUrl("http://accounts.example.test/login"), false);
	assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
	assert.equal(isSafeExternalUrl("https://user:password@accounts.example.test/login"), false);
});

test("renderer CSP keeps executable and navigation sources local", () => {
	const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
	const main = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
	assert.match(html, /default-src 'self'/u);
	assert.match(html, /base-uri 'none'/u);
	assert.match(html, /object-src 'none'/u);
	assert.match(html, /frame-ancestors 'none'/u);
	assert.match(html, /form-action 'none'/u);
	assert.match(html, /script-src 'self'/u);
	assert.match(html, /connect-src 'self'/u);
	assert.doesNotMatch(html, /script-src[^;]*unsafe-inline/u);
	assert.match(main, /Content-Security-Policy/u);
});

test("IPC accepts only the current app renderer, never a blank or foreign frame", () => {
	const index = "/Applications/Atomic.app/Contents/Resources/app.asar/out/renderer/index.html";
	assert.equal(isTrustedIpcSender(7, 7, `file://${index}`, index), true);
	assert.equal(isTrustedIpcSender(8, 7, `file://${index}`, index), false);
	assert.equal(isTrustedIpcSender(7, 7, "about:blank", index), false);
	assert.equal(isTrustedIpcSender(7, 7, "https://attacker.example/", index), false);
});

test("raw protocol logging redacts credential fields at every level", () => {
	const line = JSON.stringify({
		type: "oauth_info",
		accessToken: "token-value",
		payload: { client_secret: "secret-value", message: "continue" },
		items: [{ apiKey: "key-value" }],
		token: "bare-token-value",
		code: "verification-value",
	});
	const redacted = redactSensitiveProtocolLine(line);
	assert.doesNotMatch(redacted, /token-value|secret-value|key-value|bare-token-value|verification-value/u);
	assert.match(redacted, /\[redacted\]/u);
	assert.equal(redactSensitiveProtocolLine("engine diagnostic"), "engine diagnostic");
});
