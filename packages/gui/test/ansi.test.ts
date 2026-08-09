import assert from "node:assert/strict";
import { test } from "vitest";
import { ansiLinesToHtml, ansiLineToHtml, ansiLineToSegments } from "../src/renderer/src/helpers/ansi.ts";

test("ansiLineToHtml escapes HTML and applies SGR colors", () => {
	const html = ansiLineToHtml("hello <world> \x1b[31mbad\x1b[0m");
	assert.match(html, /&lt;world&gt;/);
	assert.match(html, /color:#f38ba8/);
	assert.match(html, />bad</);
	assert.doesNotMatch(html, /<world>/);
});

test("ansiLinesToHtml wraps each line", () => {
	const html = ansiLinesToHtml(["a", "b"]);
	assert.match(html, /ansi-line/);
	assert.equal((html.match(/ansi-line/g) ?? []).length, 2);
});

test("ansiLineToSegments preserves text and SGR styles without HTML", () => {
	const segments = ansiLineToSegments("plain \x1b[32mgreen\x1b[0m");
	assert.deepEqual(
		segments.map((segment) => [segment.text, segment.fg]),
		[
			["plain ", undefined],
			["green", "#a6e3a1"],
		],
	);
});
