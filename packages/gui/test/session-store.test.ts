import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import { useSessionStore } from "../src/renderer/src/store/session-store.ts";

beforeEach(() => {
	useSessionStore.setState({
		status: { state: "idle" },
		entries: [],
		working: false,
		workingLabel: "thinking",
		workingVisible: true,
		workingIndicatorFrames: undefined,
		workingIndicatorIntervalMs: undefined,
		rawLines: [],
		showRawLog: false,
		hideThinking: false,
		hiddenThinkingLabel: "Thinking...",
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
		extensionShortcuts: [],
		models: [],
		sessions: [],
		treeNodes: [],
		treeLeafId: null,
		transcriptLeafId: null,
		themes: [],
		themeName: "dark",
		frames: [],
		authCatalog: null,
		authBusyProvider: undefined,
		trustStatus: undefined,
		trustOptions: [],
		inputForm: undefined,
		hostSessionPicker: undefined,
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

test("hydrateTranscript restores durable messages and session boundaries", () => {
	const { hydrateTranscript } = useSessionStore.getState();
	hydrateTranscript(
		[
			{ type: "session_info", id: "ignore", parentId: null, timestamp: "2026-01-01T00:00:00Z", name: "Demo" },
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "2026-01-01T00:00:01Z",
				message: { role: "user", content: "Hello" },
			},
			{
				type: "message",
				id: "a1",
				parentId: "u1",
				timestamp: "2026-01-01T00:00:02Z",
				message: { role: "assistant", content: [{ type: "text", text: "Hi" }] },
			},
			{ type: "compaction", id: "c1", parentId: "a1", timestamp: "2026-01-01T00:00:03Z", summary: "Kept tail" },
			{ type: "branch_summary", id: "b1", parentId: "c1", timestamp: "2026-01-01T00:00:04Z", summary: "Old branch" },
		],
		"a1",
	);

	const state = useSessionStore.getState();
	assert.deepEqual(
		state.entries.map((entry) => [entry.id, entry.kind, entry.text]),
		[
			["u1", "user", "Hello"],
			["a1", "assistant", "Hi"],
			["c1", "compaction", "Kept tail"],
			["b1", "branchSummary", "Old branch"],
		],
	);
	assert.equal(state.transcriptLeafId, "a1");
});

test("session switch hydration replaces prior transcript and tracks active leaf", () => {
	const { hydrateTranscript, resetTranscript, setTree } = useSessionStore.getState();

	hydrateTranscript(
		[
			{
				type: "message",
				id: "old-user",
				parentId: null,
				timestamp: "2026-01-01T00:00:01Z",
				message: { role: "user", content: "session-A" },
			},
			{
				type: "message",
				id: "old-assistant",
				parentId: "old-user",
				timestamp: "2026-01-01T00:00:02Z",
				message: { role: "assistant", content: [{ type: "text", text: "from-A" }] },
			},
		],
		"old-assistant",
	);
	setTree([{ id: "old-assistant", kind: "message", summary: "from-A", children: [] }], "old-assistant");
	assert.equal(
		useSessionStore.getState().entries.some((entry) => entry.text === "session-A"),
		true,
	);
	assert.equal(useSessionStore.getState().transcriptLeafId, "old-assistant");
	assert.equal(useSessionStore.getState().treeLeafId, "old-assistant");

	// App switch path: reset then hydrate the next session's get_entries payload.
	resetTranscript();
	assert.equal(useSessionStore.getState().entries.length, 0);
	assert.equal(useSessionStore.getState().transcriptLeafId, null);
	assert.equal(useSessionStore.getState().treeLeafId, null);

	hydrateTranscript(
		[
			{
				type: "message",
				id: "new-user",
				parentId: null,
				timestamp: "2026-01-02T00:00:01Z",
				message: { role: "user", content: "session-B" },
			},
			{
				type: "message",
				id: "new-assistant",
				parentId: "new-user",
				timestamp: "2026-01-02T00:00:02Z",
				message: { role: "assistant", content: [{ type: "text", text: "from-B" }] },
			},
		],
		"new-assistant",
	);
	setTree([{ id: "new-assistant", kind: "message", summary: "from-B", children: [] }], "new-assistant");

	const state = useSessionStore.getState();
	assert.deepEqual(
		state.entries.map((entry) => [entry.id, entry.text]),
		[
			["new-user", "session-B"],
			["new-assistant", "from-B"],
		],
	);
	assert.equal(
		state.entries.some((entry) => entry.id === "old-user" || entry.text === "session-A" || entry.text === "from-A"),
		false,
		"prior session transcript must not leak after switch hydration",
	);
	assert.equal(state.transcriptLeafId, "new-assistant");
	assert.equal(state.treeLeafId, "new-assistant");
	assert.equal(state.transcriptLeafId, state.treeLeafId, "hydrated leaf must match active tree leaf");
});

test("engine keybinding updates expose extension shortcuts", () => {
	useSessionStore.getState().ingestEvent({
		type: "engine_keybindings_reloaded",
		state: {
			userBindings: {},
			effectiveBindings: {},
			shortcuts: [{ key: "f2", description: "Open workflow graph" }],
		},
	});
	assert.deepEqual(useSessionStore.getState().extensionShortcuts, [{ key: "f2", description: "Open workflow graph" }]);
});

test("extension working configuration updates label, visibility, and animation", () => {
	useSessionStore.getState().ingestExtensionUi({
		id: "work-1",
		method: "setWorking",
		message: "Indexing",
		visible: false,
		frames: ["·", "•"],
		intervalMs: 120,
	});
	const state = useSessionStore.getState();
	assert.equal(state.workingLabel, "Indexing");
	assert.equal(state.workingVisible, false);
	assert.deepEqual(state.workingIndicatorFrames, ["·", "•"]);
	assert.equal(state.workingIndicatorIntervalMs, 120);
	useSessionStore
		.getState()
		.ingestExtensionUi({ id: "work-2", method: "setWorking", resetMessage: true, resetIndicator: true });
	assert.equal(useSessionStore.getState().workingLabel, "thinking");
	assert.equal(useSessionStore.getState().workingIndicatorFrames, undefined);
});

test("extension hidden-thinking label is applied and reset", () => {
	const { ingestExtensionUi } = useSessionStore.getState();
	ingestExtensionUi({ id: "thinking-1", method: "setHiddenThinkingLabel", label: "Reasoning privately" });
	assert.equal(useSessionStore.getState().hiddenThinkingLabel, "Reasoning privately");
	ingestExtensionUi({ id: "thinking-2", method: "setHiddenThinkingLabel" });
	assert.equal(useSessionStore.getState().hiddenThinkingLabel, "Thinking...");
});

test("tool execution streams renderer state and keeps its ANSI frame out of extension overlays", () => {
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
	assert.equal(entry?.remoteRenderId, "gui-tool-render:t1");
	assert.deepEqual(entry?.toolArgs, { command: "ls" });
	assert.deepEqual(entry?.toolResult, { output: "ok" });
	assert.equal(entry?.streaming, false);
	assert.match(entry?.text ?? "", /output/);
	const renderGeneration = entry?.remoteRenderGeneration ?? 0;
	ingestEvent({ type: "engine_custom_invalidate", componentId: "gui-tool-render:t1" });
	assert.equal(useSessionStore.getState().entries[0]?.remoteRenderGeneration, renderGeneration + 1);
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "gui-tool-render:t1",
		requestId: 2,
		lines: ["\x1b[32mbash complete\x1b[0m"],
	});
	assert.deepEqual(useSessionStore.getState().entries[0]?.remoteRenderLines, ["\x1b[32mbash complete\x1b[0m"]);
	assert.equal(useSessionStore.getState().frames.length, 0);
});

test("tool execution updates preserve partial results for the remote renderer", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: { command: "pwd" } });
	ingestEvent({
		type: "tool_execution_update",
		toolCallId: "t1",
		toolName: "bash",
		args: { command: "pwd" },
		partialResult: { content: [{ type: "text", text: "/workspace" }] },
	});
	const entry = useSessionStore.getState().entries[0];
	assert.deepEqual(entry?.toolResult, { content: [{ type: "text", text: "/workspace" }] });
	assert.match(entry?.text ?? "", /workspace/);
	assert.equal(entry?.streaming, true);
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
	ingestEvent({
		type: "engine_custom_open",
		componentId: "c1",
		overlay: true,
		overlayOptions: { anchor: "top", width: 40 },
		handlesCtrlC: true,
	});
	const opened = useSessionStore.getState().frames[0];
	assert.equal(opened?.overlayOptions?.anchor, "top");
	assert.equal(opened?.handlesCtrlC, true);
	assert.equal(opened?.renderGeneration, 1);
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

test("engine custom chrome frames retain their host slot", () => {
	useSessionStore.getState().ingestEvent({
		type: "engine_custom_open",
		componentId: "header-1",
		overlay: false,
		chromeSlot: "header",
	});
	assert.equal(useSessionStore.getState().frames[0]?.chromeSlot, "header");
});

test("engine_custom_invalidate and control update frame host state", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "engine_custom_open", componentId: "c2", overlay: true });
	const gen1 = useSessionStore.getState().frames[0]?.renderGeneration ?? 0;
	ingestEvent({ type: "engine_custom_invalidate", componentId: "c2" });
	assert.equal(useSessionStore.getState().frames[0]?.renderGeneration, gen1 + 1);
	ingestEvent({ type: "engine_custom_control", componentId: "c2", action: "hide" });
	assert.equal(useSessionStore.getState().frames[0]?.hidden, true);
	ingestEvent({ type: "engine_custom_control", componentId: "c2", action: "show" });
	assert.equal(useSessionStore.getState().frames[0]?.hidden, false);
	ingestEvent({
		type: "engine_custom_terminal",
		componentId: "c2",
		control: { kind: "mouse-scroll-tracking", enabled: true },
	});
	assert.equal(useSessionStore.getState().frames[0]?.mouseScrollTracking, true);
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "c2",
		requestId: 1,
		lines: ["a"],
	});
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "c2",
		requestId: 0,
		lines: ["stale"],
	});
	assert.equal(useSessionStore.getState().frames[0]?.lines[0], "a");
});

test("engine_session_picker_open/update/error/close drive host picker modal", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "engine_session_picker_open",
		componentId: "pick1",
		sessions: [
			{
				path: "/tmp/s.jsonl",
				id: "abc",
				cwd: "/proj",
				createdAt: 1,
				modifiedAt: 2,
				messageCount: 3,
				firstMessage: "hi",
				name: "demo",
			},
		],
		showRenameHint: true,
	});
	let state = useSessionStore.getState();
	assert.equal(state.modal, "hostSessionPicker");
	assert.equal(state.hostSessionPicker?.sessions[0]?.name, "demo");
	ingestEvent({
		type: "engine_session_picker_update",
		componentId: "pick1",
		sessions: [],
	});
	assert.equal(useSessionStore.getState().hostSessionPicker?.sessions.length, 0);
	ingestEvent({ type: "engine_session_picker_error", componentId: "pick1", message: "nope" });
	assert.equal(useSessionStore.getState().hostSessionPicker?.errorMessage, "nope");
	ingestEvent({ type: "engine_session_picker_close", componentId: "pick1" });
	state = useSessionStore.getState();
	assert.equal(state.modal, "none");
	assert.equal(state.hostSessionPicker, undefined);
});

test("engine_custom_terminal autowrap toggles frame wrap mode", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "engine_custom_open", componentId: "c3", overlay: true });
	ingestEvent({
		type: "engine_custom_terminal",
		componentId: "c3",
		control: { kind: "autowrap", enabled: false },
	});
	assert.equal(useSessionStore.getState().frames[0]?.terminalAutowrap, false);
});

test("engine_input_form_open mounts the input form modal", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "engine_input_form_open",
		componentId: "form1",
		title: "API key",
		heading: "PROVIDER LOGIN",
		fields: [{ name: "value", type: "string", initialValue: "", placeholder: "sk-..." }],
	});
	const state = useSessionStore.getState();
	assert.equal(state.modal, "inputForm");
	assert.equal(state.inputForm?.componentId, "form1");
	assert.equal(state.inputForm?.fields[0]?.name, "value");
});

test("oauth_prompt opens dialog modal", () => {
	const { ingestExtensionUi } = useSessionStore.getState();
	ingestExtensionUi({
		id: "o1",
		method: "oauth_prompt",
		provider: "openai",
		loginId: "openai",
		prompt: { message: "Enter code", placeholder: "code" },
	});
	const state = useSessionStore.getState();
	assert.equal(state.modal, "dialog");
	assert.equal(state.activeDialog?.method, "oauth_prompt");
});
