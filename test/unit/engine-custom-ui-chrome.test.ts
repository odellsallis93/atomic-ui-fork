import assert from "node:assert/strict";
import { test } from "vitest";
import { KeybindingsManager } from "../../packages/coding-agent/src/core/keybindings.ts";
import { EngineCustomUiService } from "../../packages/coding-agent/src/modes/interactive-engine/engine-custom-ui.ts";
import { parseInteractiveEngineMessage } from "../../packages/coding-agent/src/modes/interactive-engine/protocol.ts";
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
