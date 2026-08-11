import assert from "node:assert/strict";
import { test } from "vitest";
import { isAllowedAppNavigation, isSafeExternalUrl, redactSensitiveProtocolLine } from "../src/main/security.ts";

test("packaged navigation allows only its document and local dev origin", () => {
	const index = "/Applications/Atomic.app/Contents/Resources/app.asar/out/renderer/index.html";
	assert.equal(isAllowedAppNavigation(`file://${index}`, index), true);
	assert.equal(isAllowedAppNavigation("https://attacker.example/", index), false);
	assert.equal(isAllowedAppNavigation("http://127.0.0.1:5173/other", index, "http://127.0.0.1:5173/"), true);
	assert.equal(isAllowedAppNavigation("http://192.168.1.5:5173/", index, "http://192.168.1.5:5173/"), false);
});

test("external links allow HTTPS and local OAuth callbacks only", () => {
	assert.equal(isSafeExternalUrl("https://accounts.example.test/login"), true);
	assert.equal(isSafeExternalUrl("http://localhost:3000/callback"), true);
	assert.equal(isSafeExternalUrl("http://accounts.example.test/login"), false);
	assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});

test("raw protocol logging redacts credential fields at every level", () => {
	const line = JSON.stringify({
		type: "oauth_info",
		accessToken: "token-value",
		payload: { client_secret: "secret-value", message: "continue" },
		items: [{ apiKey: "key-value" }],
	});
	const redacted = redactSensitiveProtocolLine(line);
	assert.doesNotMatch(redacted, /token-value|secret-value|key-value/);
	assert.match(redacted, /\[redacted\]/);
	assert.equal(redactSensitiveProtocolLine("engine diagnostic"), "engine diagnostic");
});
