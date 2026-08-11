import assert from "node:assert/strict";
import { test } from "vitest";
import {
	actionForKey,
	collapseLargePaste,
	expandPasteMarkers,
	matchesBinding,
	restoreQueuedDraft,
} from "../src/renderer/src/helpers/composer-parity.ts";

test("configured composer key matrix routes only in its focus zone", () => {
	const bindings = {
		"app.message.followUp": "ctrl+enter",
		"app.message.dequeue": ["alt+up"],
		"app.interrupt": "ctrl+k",
	};
	assert.equal(actionForKey(bindings, "ctrl+enter", "composer"), "app.message.followUp");
	assert.equal(actionForKey(bindings, "ctrl+enter", "transcript"), undefined);
	assert.equal(actionForKey(bindings, "ctrl+k", "composer"), "app.interrupt");
	assert.equal(actionForKey(bindings, "ctrl+k", "modal"), undefined);
	assert.equal(matchesBinding(bindings, "app.message.dequeue", "alt+up"), true);
});

test("large paste markers expand only at delivery", () => {
	const registry = new Map<number, string>();
	const payload = "x".repeat(1000);
	const marker = collapseLargePaste(payload, registry);
	assert.match(marker, /^\[paste #1 1000 chars\]$/);
	assert.equal(expandPasteMarkers(`before ${marker} after`, registry), `before ${payload} after`);
	assert.equal(expandPasteMarkers(marker, new Map()), marker);
});

test("dequeue keeps FIFO messages above the current draft", () => {
	assert.equal(restoreQueuedDraft(["steer", "follow-up"], "draft"), "steer\n\nfollow-up\n\ndraft");
});
