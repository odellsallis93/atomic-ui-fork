import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeTerminalKey, encodeTerminalKeyRelease } from "../src/renderer/src/helpers/key-encode.ts";

test("encodeTerminalKey maps arrows, escape, enter, and ctrl letters", () => {
	assert.equal(encodeTerminalKey({ key: "ArrowUp", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }), "\x1b[A");
	assert.equal(encodeTerminalKey({ key: "Escape", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }), "\x1b");
	assert.equal(encodeTerminalKey({ key: "Enter", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }), "\r");
	assert.equal(encodeTerminalKey({ key: "c", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }), "\x03");
	assert.equal(encodeTerminalKey({ key: "Tab", ctrlKey: false, altKey: false, metaKey: false, shiftKey: true }), "\x1b[Z");
	assert.equal(encodeTerminalKey({ key: "a", ctrlKey: false, altKey: true, metaKey: false, shiftKey: false }), "\x1ba");
	assert.equal(encodeTerminalKey({ key: "F2", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }), "\x1bOQ");
});

test("encodeTerminalKey ignores bare modifiers", () => {
	assert.equal(encodeTerminalKey({ key: "Control", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }), undefined);
});

test("encodeTerminalKeyRelease emits kitty flag-2 release sequences", () => {
	assert.equal(
		encodeTerminalKeyRelease({ key: "ArrowLeft", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }),
		"\x1b[-4;1:3u",
	);
	assert.equal(
		encodeTerminalKeyRelease({ key: "a", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }),
		"\x1b[97;1:3u",
	);
	assert.equal(
		encodeTerminalKeyRelease({ key: "a", ctrlKey: true, altKey: false, metaKey: false, shiftKey: false }),
		"\x1b[97;5:3u",
	);
});
