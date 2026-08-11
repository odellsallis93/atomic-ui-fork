// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { FrameOverlay } from "../src/renderer/src/components/FrameOverlay";
import type { CustomFrame } from "../src/renderer/src/store/session-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
});

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
});

const frame: CustomFrame = {
	componentId: "frame-1",
	overlay: true,
	lines: ["frame"],
	appliedRequestId: 0,
	renderGeneration: 1,
	handlesCtrlC: false,
	hidden: false,
	focused: true,
	mouseScrollTracking: false,
	terminalAutowrap: true,
};

async function mount(modalOpen: boolean, onInput: (data: string) => void): Promise<void> {
	root = createRoot(container);
	await act(async () => {
		root.render(
			createElement(FrameOverlay, {
				frames: [frame],
				modalOpen,
				onDismiss: () => undefined,
				onInput: (_componentId: string, data: string) => onInput(data),
				onRender: () => undefined,
			}),
		);
	});
}

test("native modal state blocks focused frame keys and restores forwarding after close", async () => {
	const inputs: string[] = [];
	const recordInput = (data: string): void => {
		inputs.push(data);
	};
	await mount(true, recordInput);
	window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
	assert.deepEqual(inputs, []);

	await act(async () => {
		root.render(
			createElement(FrameOverlay, {
				frames: [frame],
				modalOpen: false,
				onDismiss: () => undefined,
				onInput: (_componentId: string, data: string) => recordInput(data),
				onRender: () => undefined,
			}),
		);
	});
	window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
	assert.deepEqual(inputs, ["\x1b[D"]);
});

test("focused frames do not receive Ctrl+C unless the engine declared ownership", async () => {
	const inputs: string[] = [];
	await mount(false, (data) => inputs.push(data));
	window.dispatchEvent(
		new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }),
	);
	assert.deepEqual(inputs, []);
});
