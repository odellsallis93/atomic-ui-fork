import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import { useSessionStore } from "../src/renderer/src/store/session-store.ts";

beforeEach(() => {
	useSessionStore.setState({
		status: { state: "idle" },
		entries: [],
		working: false,
		workingLabel: "thinking",
		rawLines: [],
		showRawLog: false,
		hideThinking: false,
		queue: [],
		composerText: "",
		promptHistory: [],
		historyIndex: -1,
		errorBanner: undefined,
		usageLabel: "—",
		statusSegments: {},
		widgets: [],
		toasts: [],
		commands: [],
		models: [],
		sessions: [],
		treeNodes: [],
		treeLeafId: null,
		themes: [],
		themeName: "dark",
		frames: [],
		modal: "none",
		activeDialog: undefined,
	});
});

test("ingestEvent streams assistant text deltas into one entry", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "message_start",
		message: { id: "m1", role: "assistant", content: [] },
	});
	ingestEvent({
		type: "message_update",
		message: { id: "m1", role: "assistant", content: [] },
		assistantMessageEvent: { type: "text_delta", delta: "Hello" },
	});
	ingestEvent({
		type: "message_update",
		message: { id: "m1", role: "assistant", content: [] },
		assistantMessageEvent: { type: "text_delta", delta: " world" },
	});
	ingestEvent({
		type: "message_end",
		message: { id: "m1", role: "assistant", content: [{ type: "text", text: "Hello world" }] },
	});

	const entries = useSessionStore.getState().entries;
	assert.equal(entries.length, 1);
	assert.equal(entries[0]?.kind, "assistant");
	assert.equal(entries[0]?.text, "Hello world");
	assert.equal(entries[0]?.streaming, false);
});

test("tool execution start/end creates expandable tool entry", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "tool_execution_start",
		toolCallId: "t1",
		toolName: "bash",
		args: { command: "ls" },
	});
	ingestEvent({
		type: "tool_execution_end",
		toolCallId: "t1",
		result: { output: "ok" },
		isError: false,
	});
	const entry = useSessionStore.getState().entries[0];
	assert.equal(entry?.kind, "tool");
	assert.equal(entry?.toolName, "bash");
	assert.equal(entry?.streaming, false);
	assert.match(entry?.text ?? "", /output/);
});

test("bash execution updates append streaming output", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "bash_execution_start", id: "b1", command: "echo hi" });
	ingestEvent({ type: "bash_execution_update", id: "b1", delta: "hi\n" });
	ingestEvent({ type: "bash_execution_end", id: "b1" });
	const entry = useSessionStore.getState().entries[0];
	assert.equal(entry?.kind, "bash");
	assert.match(entry?.text ?? "", /echo hi/);
	assert.match(entry?.text ?? "", /hi/);
	assert.equal(entry?.streaming, false);
});

test("extension UI notify/status/widget land in store", () => {
	const { ingestExtensionUi } = useSessionStore.getState();
	ingestExtensionUi({ id: "n1", method: "notify", message: "hello", notifyType: "info" });
	ingestExtensionUi({ id: "s1", method: "setStatus", statusKey: "mcp", statusText: "ok" });
	ingestExtensionUi({
		id: "w1",
		method: "setWidget",
		widgetKey: "bg",
		widgetLines: ["running"],
		widgetPlacement: "belowEditor",
	});
	const state = useSessionStore.getState();
	assert.equal(state.toasts[0]?.message, "hello");
	assert.equal(state.statusSegments.mcp, "ok");
	assert.equal(state.widgets[0]?.lines[0], "running");
});

test("engine_custom_open/frame/close manage frame surfaces", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "engine_custom_open", componentId: "c1", overlay: true });
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "c1",
		requestId: 1,
		lines: ["\x1b[32mok\x1b[0m"],
	});
	assert.equal(useSessionStore.getState().frames.length, 1);
	assert.equal(useSessionStore.getState().frames[0]?.lines[0], "\x1b[32mok\x1b[0m");
	ingestEvent({ type: "engine_custom_close", componentId: "c1" });
	assert.equal(useSessionStore.getState().frames.length, 0);
});
