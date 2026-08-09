import assert from "node:assert/strict";
import { test } from "vitest";
import { KeybindingsManager } from "../../packages/coding-agent/src/core/keybindings.ts";
import { EngineCustomUiService } from "../../packages/coding-agent/src/modes/interactive-engine/engine-custom-ui.ts";
import {
	parseInteractiveEngineMessage,
	serializeInteractiveEngineFrame,
} from "../../packages/coding-agent/src/modes/interactive-engine/protocol.ts";
import { sleep } from "../helpers/runtime.ts";

test("remote chrome slots publish replacement frames through the custom-frame protocol", async () => {
	const output: string[] = [];
	const service = new EngineCustomUiService((line) => output.push(line), new KeybindingsManager());
	service.setChrome("footer", () => ({ render: () => ["first footer"], invalidate: () => {} }));
	await sleep(0);
	const firstOpen = output
		.map(parseInteractiveEngineMessage)
		.find((message) => message?.type === "engine_custom_open" && message.chromeSlot === "footer");
	assert.ok(firstOpen?.type === "engine_custom_open");
	assert.equal(firstOpen.chromeSlot, "footer");

	service.setChrome("footer", () => ({ render: () => ["second footer"], invalidate: () => {} }));
	await sleep(0);
	const messages = output.map(parseInteractiveEngineMessage);
	assert.ok(
		messages.some(
			(message) => message?.type === "engine_custom_close" && message.componentId === firstOpen.componentId,
		),
		"replacing a chrome slot closes the old frame",
	);
	assert.equal(
		messages.filter((message) => message?.type === "engine_custom_open" && message.chromeSlot === "footer").length,
		2,
	);
	service.dispose();
});

test("remote custom editors accept input, preserve text, and submit through the engine", async () => {
	const output: string[] = [];
	let text = "";
	let submitted: string | undefined;
	const service = new EngineCustomUiService((line) => output.push(line), new KeybindingsManager());
	const editor = {
		render: () => [`editor:${text}`],
		invalidate: () => {},
		getText: () => text,
		setText: (next: string) => {
			text = next;
		},
		onSubmit: undefined as ((value: string) => void) | undefined,
		handleInput: (data: string) => {
			if (data === "\r") editor.onSubmit?.(text);
			else text += data;
		},
	};
	service.setEditor(
		() => editor,
		(value) => {
			submitted = value;
		},
	);
	await sleep(0);
	const open = output
		.map(parseInteractiveEngineMessage)
		.find((message) => message?.type === "engine_custom_open" && message.chromeSlot === "editor");
	assert.ok(open?.type === "engine_custom_open");
	assert.equal(service.setEditorText("draft"), true);
	assert.equal(service.getEditorText(), "draft");
	service.handleLine(
		serializeInteractiveEngineFrame({ type: "engine_custom_input", componentId: open.componentId, data: "!" }),
	);
	assert.equal(service.getEditorText(), "draft!");
	service.handleLine(
		serializeInteractiveEngineFrame({ type: "engine_custom_input", componentId: open.componentId, data: "\r" }),
	);
	assert.equal(submitted, "draft!");
	service.dispose();
});

test("remote custom editor factory is available for extension state restoration", () => {
	const service = new EngineCustomUiService(() => {}, new KeybindingsManager());
	const factory = () => ({
		render: () => [],
		invalidate: () => {},
		getText: () => "",
		setText: () => {},
		handleInput: () => {},
	});
	service.setEditor(factory, () => {});
	assert.equal(service.getEditor(), factory);
	service.setEditor(undefined, () => {});
	assert.equal(service.getEditor(), undefined);
	service.dispose();
});
