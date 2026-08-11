import assert from "node:assert/strict";
import { test } from "vitest";
import {
	actionForKey,
	collapseLargePaste,
	expandPasteMarkers,
	keyboardShortcut,
	matchesBinding,
	restoreFailedDraft,
	restoreQueuedDraft,
} from "../src/renderer/src/helpers/composer-parity.ts";

test("configured composer key matrix routes actions only to the owning focus zone", () => {
	const bindings = {
		"tui.input.submit": "ctrl+enter",
		"app.message.followUp": "alt+f",
		"app.message.dequeue": ["alt+up"],
		"app.interrupt": "ctrl+k",
		"app.model.select": "alt+m",
		"app.thinking.toggle": "alt+t",
		"app.tools.expand": "alt+o",
	};
	assert.equal(actionForKey(bindings, "ctrl+enter", "composer"), "tui.input.submit");
	assert.equal(actionForKey(bindings, "alt+f", "composer"), "app.message.followUp");
	assert.equal(actionForKey(bindings, "alt+m", "transcript"), "app.model.select");
	assert.equal(actionForKey(bindings, "alt+m", "modal"), undefined);
	assert.equal(actionForKey(bindings, "ctrl+enter", "frame"), undefined);
	assert.equal(matchesBinding(bindings, "app.message.dequeue", "alt+up"), true);
	assert.equal(
		keyboardShortcut({ key: "ArrowUp", ctrlKey: false, shiftKey: false, altKey: true, metaKey: false }),
		"alt+up",
	);
});

test("large paste markers expand for delivery and rejected sends restore their payload", () => {
	const registry = new Map<number, string>();
	const payload = "x".repeat(1000);
	const marker = collapseLargePaste(payload, registry);
	assert.match(marker, /^\[paste #1 1000 chars\]$/);
	const expanded = expandPasteMarkers(`before ${marker} after`, registry);
	assert.equal(expanded, `before ${payload} after`);
	assert.equal(restoreFailedDraft(expanded, "new draft"), `${expanded}\n\nnew draft`);
	assert.equal(expandPasteMarkers(marker, new Map()), marker);
});

test("dequeue uses engine FIFO order above the live draft", () => {
	assert.equal(restoreQueuedDraft(["steer", "follow-up"], "draft"), "steer\n\nfollow-up\n\ndraft");
	assert.equal(restoreFailedDraft("", "draft"), "draft");
});
