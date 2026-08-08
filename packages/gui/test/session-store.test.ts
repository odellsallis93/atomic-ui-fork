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
		queue: [],
		composerText: "",
		errorBanner: undefined,
		usageLabel: "—",
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
