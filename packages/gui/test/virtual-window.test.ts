import assert from "node:assert/strict";
import { test } from "vitest";
import { getVirtualWindow, isNearTranscriptEnd } from "../src/renderer/src/helpers/virtual-window.ts";

test("long transcript virtualization keeps a realistic 10,000-row render bounded", () => {
	const ids = Array.from({ length: 10_000 }, (_, index) => `entry-${index}`);
	const heights = new Map(ids.map((id, index) => [id, 80 + (index % 7) * 30]));
	const viewportHeight = 720;
	const window = getVirtualWindow(10_000, 640_000, viewportHeight, heights, ids);

	assert.ok(window.totalHeight > 1_000_000);
	assert.ok(window.start > 0, "the initial rows are not mounted far into a long transcript");
	assert.ok(window.end < ids.length, "the final rows are not mounted far into a long transcript");
	assert.ok(window.end - window.start < 30, "overscan renders a small bounded set of rows");
	assert.ok(window.offsets[window.start] <= 640_000);
	assert.ok(window.offsets[window.end] >= 640_000 + viewportHeight);
});

test("virtual transcript only auto-follows at the end", () => {
	assert.equal(isNearTranscriptEnd(968, 500, 1_500), true);
	assert.equal(isNearTranscriptEnd(900, 500, 1_500), false);
});
