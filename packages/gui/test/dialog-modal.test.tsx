// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { DialogModal } from "../src/renderer/src/components/DialogModal";
import type { ExtensionUiRequest, ExtensionUiResponse } from "../src/shared/ipc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	vi.useFakeTimers();
	container = document.createElement("div");
	document.body.append(container);
});

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
	vi.useRealTimers();
});
async function render(request: ExtensionUiRequest, onRespond: (response: ExtensionUiResponse) => void): Promise<void> {
	root = createRoot(container);
	await act(async () => {
		root.render(createElement(DialogModal, { request, onRespond }));
	});
}

async function rerender(request: ExtensionUiRequest, onRespond: (response: ExtensionUiResponse) => void): Promise<void> {
	await act(async () => {
		root.render(createElement(DialogModal, { request, onRespond }));
	});
}

describe("DialogModal keyboard and timeout contract", () => {
	test("keeps the original timeout deadline across host rerenders", async () => {
		const request: ExtensionUiRequest = { id: "timeout-1", method: "input", title: "Code", timeout: 50 };
		const responses: ExtensionUiResponse[] = [];
		await render(request, (response) => responses.push(response));
		act(() => void vi.advanceTimersByTime(30));
		await rerender(request, (response) => responses.push(response));
		act(() => void vi.advanceTimersByTime(19));
		assert.equal(responses.length, 0);
		act(() => void vi.advanceTimersByTime(1));
		assert.deepEqual(responses, [{ id: "timeout-1", cancelled: true }]);
	});

	test("submits input with Enter but leaves editor Enter available for newlines", async () => {
		const inputResponses: ExtensionUiResponse[] = [];
		const inputRequest: ExtensionUiRequest = { id: "input-1", method: "input", title: "Value" };
		await render(inputRequest, (response) => inputResponses.push(response));
		act(() => void vi.runOnlyPendingTimers());
		const input = container.querySelector("input") as HTMLInputElement;
		act(() => {
			input.value = "answer";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		act(() => {
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		assert.deepEqual(inputResponses, [{ id: "input-1", value: "" }]);

		act(() => root.unmount());
		const editorResponses: ExtensionUiResponse[] = [];
		const editorRequest: ExtensionUiRequest = { id: "editor-1", method: "editor", title: "Edit", prefill: "draft" };
		await render(editorRequest, (response) => editorResponses.push(response));
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
		act(() => {
			textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		});
		assert.deepEqual(editorResponses, []);
	});

	test("responds once on Escape and restores the element that was focused before opening", async () => {
		const previous = document.createElement("button");
		previous.textContent = "frame";
		document.body.append(previous);
		previous.focus();
		const responses: ExtensionUiResponse[] = [];
		const request: ExtensionUiRequest = { id: "escape-1", method: "confirm", title: "Confirm", message: "Continue?" };
		await render(request, (response) => responses.push(response));
		act(() => void vi.runOnlyPendingTimers());
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		});
		assert.deepEqual(responses, [{ id: "escape-1", cancelled: true }]);
		act(() => root.unmount());
		assert.equal(document.activeElement, previous);
		previous.remove();
	});
});
