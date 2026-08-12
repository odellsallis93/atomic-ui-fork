// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { Composer } from "../src/renderer/src/components/Composer.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

async function renderComposer(
	onTerminalInput: (data: string) => Promise<{ consumed: boolean; data?: string }>,
	onChange: (text: string) => void,
	options: {
		value?: string;
		onHistoryUp?: () => void;
		onHistoryDown?: () => void;
		keybindings?: Record<string, string | string[]>;
	} = {},
): Promise<void> {
	await act(async () => {
		root.render(
			<Composer
				value={options.value ?? ""}
				disabled={false}
				working={false}
				queue={[]}
				widgets={[]}
				images={[]}
				keybindings={options.keybindings ?? {}}
				extensionShortcuts={[]}
				onChange={(text) => onChange(text)}
				onSubmit={() => {}}
				onAbort={() => {}}
				onClear={() => {}}
				onDequeue={() => {}}
				onExternalEditor={() => {}}
				onModelSelect={() => {}}
				onModelCycle={() => {}}
				onThinkingCycle={() => {}}
				onThinkingToggle={() => {}}
				onToolsExpand={() => {}}
				onExtensionShortcut={() => {}}
				onHistoryUp={options.onHistoryUp ?? (() => {})}
				onHistoryDown={options.onHistoryDown ?? (() => {})}
				onAutocomplete={async () => []}
				onTerminalInput={onTerminalInput}
				onPasteImages={() => {}}
				onRemoveImage={() => {}}
			/>,
		);
	});
}

async function sendKey(key: string, init: KeyboardEventInit = {}): Promise<void> {
	const editor = container.querySelector(".composer-editor .cm-content");
	assert.ok(editor, "expected the CodeMirror content element");
	await act(async () => {
		editor.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
		await Promise.resolve();
		await Promise.resolve();
	});
}

test("terminal interception can consume composer input before it reaches CodeMirror", async () => {
	const changes: string[] = [];
	await renderComposer(async () => ({ consumed: true }), (text) => changes.push(text));
	await sendKey("x");
	assert.deepEqual(changes, []);
});

test("terminal interception applies transformed text to the native composer", async () => {
	const changes: string[] = [];
	await renderComposer(async () => ({ consumed: false, data: "GO" }), (text) => changes.push(text));
	await sendKey("x");
	assert.deepEqual(changes, ["GO"]);
});

test("empty composer delegates Up and Down to prompt history after terminal interception", async () => {
	const calls: string[] = [];
	await renderComposer(
		async () => ({ consumed: false }),
		() => {},
		{
			onHistoryUp: () => calls.push("up"),
			onHistoryDown: () => calls.push("down"),
		},
	);
	await sendKey("ArrowUp");
	await sendKey("ArrowDown");
	assert.deepEqual(calls, ["up", "down"]);
});

test("non-empty composer retains native arrow navigation instead of opening history", async () => {
	const calls: string[] = [];
	await renderComposer(
		async () => ({ consumed: false }),
		() => {},
		{ value: "draft", onHistoryUp: () => calls.push("up"), onHistoryDown: () => calls.push("down") },
	);
	await sendKey("ArrowUp");
	await sendKey("ArrowDown");
	assert.deepEqual(calls, []);
});

test("Shift+Enter inserts a new line after terminal interception", async () => {
	const changes: string[] = [];
	await renderComposer(async () => ({ consumed: false }), (text) => changes.push(text));
	await sendKey("Enter", { shiftKey: true });
	assert.deepEqual(changes, ["\n"]);
});

test("a remapped new-line binding inserts text after terminal interception", async () => {
	const changes: string[] = [];
	await renderComposer(async () => ({ consumed: false }), (text) => changes.push(text), {
		keybindings: { "tui.input.newLine": "ctrl+enter" },
	});
	await sendKey("Enter", { ctrlKey: true });
	assert.deepEqual(changes, ["\n"]);
});
