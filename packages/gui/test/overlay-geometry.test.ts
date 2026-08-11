import assert from "node:assert/strict";
import { test } from "vitest";
import { nextFrameRenderRequestId, resetFrameRenderRequestIds } from "../src/renderer/src/helpers/frame-render-ids.ts";
import { encodeWheelDelta } from "../src/renderer/src/helpers/mouse-scroll.ts";
import {
	defaultRenderGrid,
	frameRenderGrid,
	overlayOptionsToStyle,
} from "../src/renderer/src/helpers/overlay-geometry.ts";

test("overlayOptionsToStyle centers by default and maps cell sizes", () => {
	const style = overlayOptionsToStyle(
		{ anchor: "center", width: 40, maxHeight: 20, offsetX: 2 },
		{ cellWidthPx: 10, cellHeightPx: 20 },
	);
	assert.equal(style.width, "400px");
	assert.equal(style.maxHeight, "400px");
	assert.equal(style.top, "50%");
	assert.equal(style.left, "50%");
	assert.match(String(style.transform), /translate/);
});

test("overlayOptionsToStyle honors top-left anchors and string dims", () => {
	const style = overlayOptionsToStyle({
		anchor: "top-left",
		width: "50%",
		maxHeight: "30vh",
		margin: { top: 1, left: 2 },
	});
	assert.equal(style.width, "50%");
	assert.equal(style.maxHeight, "30vh");
	assert.ok(style.top);
	assert.ok(style.left);
});

test("defaultRenderGrid clamps to a usable terminal size", () => {
	const grid = defaultRenderGrid({ widthPx: 800, heightPx: 600 });
	assert.ok(grid.width >= 20);
	assert.ok(grid.rows >= 5);
});

test("frameRenderGrid honors a full-viewport generic overlay request", () => {
	const grid = frameRenderGrid(
		{ anchor: "center", width: "100%", maxHeight: "100%", margin: 0 },
		{ widthPx: 840, heightPx: 540 },
		true,
	);
	assert.equal(grid.width, 100);
	assert.equal(grid.rows, 30);
});

test("encodeWheelDelta emits SGR mouse wheel reports", () => {
	assert.equal(encodeWheelDelta(0), undefined);
	assert.equal(encodeWheelDelta(12), "\x1b[<65;1;1M");
	assert.equal(encodeWheelDelta(-3), "\x1b[<64;1;1M");
});

test("nextFrameRenderRequestId is monotonic per component", () => {
	resetFrameRenderRequestIds();
	assert.equal(nextFrameRenderRequestId("a"), 1);
	assert.equal(nextFrameRenderRequestId("a"), 2);
	assert.equal(nextFrameRenderRequestId("b"), 1);
});
