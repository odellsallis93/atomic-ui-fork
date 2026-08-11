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
		pendingTerminalControls: {},
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

test("updating an earlier transcript entry preserves its position", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "message_start", message: { id: "m1", role: "assistant", content: [] } });
	ingestEvent({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash", args: {} });
	ingestEvent({
		type: "message_update",
		message: { id: "m1", role: "assistant", content: [] },
		assistantMessageEvent: { type: "text_delta", delta: "Hello" },
	});
	assert.deepEqual(
		useSessionStore.getState().entries.map((entry) => entry.id),
		["m1", "tool-1"],
	);
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
		],
	);
	assert.equal(state.transcriptLeafId, "a1");
});

test("hydrateTranscript renders durable protocol message and entry kinds without changing the engine leaf", () => {
	useSessionStore.getState().hydrateTranscript(
		[
			{
				type: "message",
				id: "skill-1",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				message: {
					role: "user",
					content: '<skill name="tdd" location="/skills/tdd">\nTest first\n</skill>\n\nFix it',
				},
			},
			{
				type: "message",
				id: "assistant-1",
				parentId: "skill-1",
				timestamp: "2026-01-01T00:00:01Z",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "pwd" } }],
				},
			},
			{
				type: "message",
				id: "result-1",
				parentId: "assistant-1",
				timestamp: "2026-01-01T00:00:02Z",
				message: {
					role: "toolResult",
					toolCallId: "call-1",
					toolName: "bash",
					content: [{ type: "text", text: "/work" }],
					isError: false,
				},
			},
			{
				type: "message",
				id: "bash-1",
				parentId: "result-1",
				timestamp: "2026-01-01T00:00:03Z",
				message: {
					role: "bashExecution",
					command: "echo hi",
					output: "hi\n",
					exitCode: 0,
					cancelled: false,
					truncated: false,
				},
			},
			{
				type: "custom",
				id: "custom-1",
				parentId: "bash-1",
				timestamp: "2026-01-01T00:00:04Z",
				customType: "workflow",
				data: { runId: "r1" },
			},
			{
				type: "custom_message",
				id: "custom-message-1",
				parentId: "custom-1",
				timestamp: "2026-01-01T00:00:05Z",
				customType: "notice",
				content: "Shown",
				display: true,
			},
			{
				type: "message",
				id: "system-1",
				parentId: "custom-message-1",
				timestamp: "2026-01-01T00:00:06Z",
				message: { role: "system", content: "Protocol notice" },
			},
			{
				type: "branch_summary",
				id: "branch-1",
				parentId: "system-1",
				timestamp: "2026-01-01T00:00:07Z",
				fromId: "skill-1",
				summary: "Other path",
			},
			{
				type: "compaction",
				id: "compact-1",
				parentId: "branch-1",
				timestamp: "2026-01-01T00:00:08Z",
				summary: "Kept transcript",
				firstKeptEntryId: null,
				tokensBefore: 10,
				details: { strategy: "verbatim-lines" },
			},
		],
		"compact-1",
	);
	const state = useSessionStore.getState();
	assert.deepEqual(
		state.entries.map((entry) => [entry.id, entry.kind, entry.text]),
		[["compact-1", "compaction", "Kept transcript"]],
	);
	assert.equal(state.transcriptLeafId, "compact-1");
});

test("message lifecycle keeps streamed custom, skill, and system roles out of the assistant renderer", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "message_start",
		message: { id: "custom-live", role: "custom", customType: "notice", content: "Loading", display: true },
	});
	ingestEvent({
		type: "message_end",
		message: { id: "custom-live", role: "custom", customType: "notice", content: "Ready", display: true },
	});
	ingestEvent({
		type: "message_start",
		message: {
			id: "skill-live",
			role: "user",
			content: '<skill name="tdd" location="/skills/tdd">\nTest first\n</skill>',
		},
	});
	ingestEvent({
		type: "message_end",
		message: {
			id: "skill-live",
			role: "user",
			content: '<skill name="tdd" location="/skills/tdd">\nTest first\n</skill>',
		},
	});
	ingestEvent({ type: "message_start", message: { id: "system-live", role: "system", content: "Notice" } });
	ingestEvent({ type: "message_end", message: { id: "system-live", role: "system", content: "Done" } });
	assert.deepEqual(
		useSessionStore.getState().entries.map((entry) => [entry.id, entry.kind, entry.text, entry.streaming]),
		[
			["custom-live", "custom", "Ready", false],
			["skill-live", "skill", "", false],
			["system-live", "system", "Done", false],
		],
	);
});

test("session switch hydration replaces prior transcript and clears session-scoped widgets", () => {
	const { hydrateTranscript, resetTranscript, setTree, ingestEvent } = useSessionStore.getState();

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
	ingestEvent({
		type: "engine_custom_open",
		componentId: "session-A-widget",
		overlay: false,
		widgetKey: "subagents.async",
		widgetPlacement: "belowEditor",
	});
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "session-A-widget",
		requestId: 1,
		lines: ["codebase-analyzer · running"],
	});
	assert.equal(useSessionStore.getState().frames.length, 1);
	assert.equal(useSessionStore.getState().widgets.length, 1);

	// App switch path: reset then hydrate the next session's get_entries payload.
	resetTranscript();
	assert.equal(useSessionStore.getState().entries.length, 0);
	assert.equal(useSessionStore.getState().transcriptLeafId, null);
	assert.equal(useSessionStore.getState().treeLeafId, null);
	assert.equal(
		useSessionStore.getState().widgets.length,
		0,
		"prior session widgets must clear before async hydration",
	);
	assert.equal(useSessionStore.getState().frames.length, 0, "prior session frames must clear before async hydration");

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
	assert.equal(state.widgets.length, 0, "hydration must not retain a prior session widget");
});

test("same-session hydration retains a live custom widget frame", () => {
	const { hydrateTranscript, ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "engine_custom_open",
		componentId: "live-subagent-widget",
		overlay: false,
		widgetKey: "subagents.async",
		widgetPlacement: "belowEditor",
	});
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "live-subagent-widget",
		requestId: 1,
		lines: ["codebase-analyzer · running"],
	});

	hydrateTranscript([], null);

	const state = useSessionStore.getState();
	assert.equal(state.frames[0]?.componentId, "live-subagent-widget");
	assert.deepEqual(state.widgets, [
		{ key: "subagents.async", lines: ["codebase-analyzer · running"], placement: "belowEditor" },
	]);
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

test("buffers terminal controls until open and honors deferred inline focus", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({
		type: "engine_custom_terminal",
		componentId: "ordered",
		control: { kind: "mouse-scroll-tracking", enabled: true },
	});
	ingestEvent({
		type: "engine_custom_terminal",
		componentId: "ordered",
		control: { kind: "autowrap", enabled: false },
	});
	assert.equal(useSessionStore.getState().frames.length, 0);
	ingestEvent({
		type: "engine_custom_open",
		componentId: "ordered",
		overlay: false,
		deferInlineCustomUiFocus: true,
		handlesCtrlC: false,
	});
	const frame = useSessionStore.getState().frames[0];
	assert.equal(frame?.mouseScrollTracking, true);
	assert.equal(frame?.terminalAutowrap, false);
	assert.equal(frame?.focused, false);
	assert.equal(frame?.handlesCtrlC, false);
	assert.deepEqual(useSessionStore.getState().pendingTerminalControls, {});
});

test("ignores custom frames that arrive before their open message", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "engine_custom_frame", componentId: "not-open", requestId: 1, lines: ["stale"] });
	assert.equal(useSessionStore.getState().frames.length, 0);
});

test("clearDialog only clears the request that responded", () => {
	const { ingestExtensionUi, clearDialog } = useSessionStore.getState();
	ingestExtensionUi({ id: "dialog-a", method: "input", title: "A" });
	ingestExtensionUi({ id: "dialog-b", method: "input", title: "B" });
	clearDialog("dialog-a");
	assert.equal(useSessionStore.getState().activeDialog?.id, "dialog-b");
	clearDialog("dialog-b");
	assert.equal(useSessionStore.getState().activeDialog, undefined);
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

test("hydrateTranscript follows only the active leaf path and retains every durable tool card", () => {
	useSessionStore.getState().hydrateTranscript(
		[
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				message: { role: "user", content: "root" },
			},
			{
				type: "message",
				id: "kept",
				parentId: "root",
				timestamp: "2026-01-01T00:00:01Z",
				message: {
					role: "assistant",
					content: [
						{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "a" } },
						{ type: "toolCall", id: "tool-2", name: "bash", arguments: { command: "pwd" } },
					],
				},
			},
			{
				type: "message",
				id: "result-1",
				parentId: "kept",
				timestamp: "2026-01-01T00:00:02Z",
				message: {
					role: "toolResult",
					toolCallId: "tool-1",
					toolName: "read",
					content: [{ type: "text", text: "one" }],
				},
			},
			{
				type: "message",
				id: "result-2",
				parentId: "result-1",
				timestamp: "2026-01-01T00:00:03Z",
				message: {
					role: "toolResult",
					toolCallId: "tool-2",
					toolName: "bash",
					content: [{ type: "text", text: "two" }],
				},
			},
			{
				type: "message",
				id: "abandoned",
				parentId: "root",
				timestamp: "2026-01-01T00:00:04Z",
				message: { role: "assistant", content: "do not show" },
			},
		],
		"result-2",
	);
	const entries = useSessionStore.getState().entries;
	assert.deepEqual(
		entries.map((entry) => entry.id),
		["root", "kept", "tool-1", "tool-2"],
	);
	assert.deepEqual(
		entries.filter((entry) => entry.kind === "tool").map((entry) => [entry.text, entry.remoteRenderId]),
		[
			["one", "gui-tool-render:tool-1"],
			["two", "gui-tool-render:tool-2"],
		],
	);
});

test("live tool results merge with tool execution cards without duplicates", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash", args: { command: "pwd" } });
	ingestEvent({
		type: "engine_custom_frame",
		componentId: "gui-tool-render:tool-1",
		requestId: 1,
		lines: ["running bash"],
	});
	ingestEvent({
		type: "message_start",
		message: { role: "toolResult", toolCallId: "tool-1", toolName: "bash", content: [] },
	});
	ingestEvent({
		type: "message_update",
		message: { role: "toolResult", toolCallId: "tool-1", content: [{ type: "text", text: "/work" }] },
	});
	ingestEvent({
		type: "message_end",
		message: {
			role: "toolResult",
			toolCallId: "tool-1",
			toolName: "bash",
			content: [{ type: "text", text: "/work" }],
		},
	});
	ingestEvent({ type: "tool_execution_end", toolCallId: "tool-1", result: { output: "/work" }, isError: false });
	const entries = useSessionStore.getState().entries;
	assert.equal(entries.length, 1);
	const entry = entries[0];
	assert.equal(entry?.id, "tool-1");
	assert.equal(entry?.toolName, "bash");
	assert.deepEqual(entry?.toolArgs, { command: "pwd" });
	assert.deepEqual(entry?.remoteRenderLines, ["running bash"]);
	assert.equal(entry?.remoteRenderId, "gui-tool-render:tool-1");
	assert.equal(entry?.remoteRenderGeneration, 3);
	assert.deepEqual(entry?.toolResult, { output: "/work" });
});

test("direct bash output and durable bash state remain visible", () => {
	const { ingestEvent, hydrateTranscript } = useSessionStore.getState();
	ingestEvent({ type: "bash_execution_start", id: "direct-bash", command: "echo hello" });
	ingestEvent({ type: "bash_execution_update", id: "direct-bash", channel: "stdout", delta: "hello\n" });
	ingestEvent({ type: "bash_execution_update", id: "other-bash", channel: "stderr", delta: "warn\n" });
	ingestEvent({
		type: "bash_execution_end",
		id: "direct-bash",
		output: "final\n",
		exitCode: 0,
		cancelled: false,
		truncated: false,
	});
	ingestEvent({
		type: "bash_execution_end",
		id: "other-bash",
		output: "warn\n",
		exitCode: 130,
		cancelled: true,
		truncated: true,
	});
	assert.deepEqual(
		useSessionStore
			.getState()
			.entries.map((entry) => [
				entry.id,
				entry.text,
				entry.streaming,
				entry.bashExitCode,
				entry.bashCancelled,
				entry.bashTruncated,
			]),
		[
			["direct-bash", "$ echo hello\nfinal\n", false, 0, false, false],
			["other-bash", "warn\n", false, 130, true, true],
		],
	);
	hydrateTranscript(
		[
			{
				type: "message",
				id: "bash",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				message: {
					role: "bashExecution",
					command: "cat x",
					output: "part",
					exitCode: 2,
					cancelled: true,
					truncated: true,
					fullOutputPath: "/tmp/out",
				},
			},
		],
		"bash",
	);
	assert.equal(useSessionStore.getState().treeLeafId, "bash");
	const entry = useSessionStore.getState().entries[0];
	assert.deepEqual(
		[entry?.bashExitCode, entry?.bashCancelled, entry?.bashTruncated, entry?.bashFullOutputPath],
		[2, true, true, "/tmp/out"],
	);
});

test("thinking is separate from text and image content has a visible placeholder", () => {
	useSessionStore.getState().hydrateTranscript(
		[
			{
				type: "message",
				id: "assistant",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "reason" },
						{ type: "text", text: "answer" },
						{ type: "image", data: "abc", mimeType: "image/png" },
					],
				},
			},
		],
		"assistant",
	);
	const entry = useSessionStore.getState().entries[0];
	assert.equal(entry?.text, "answer[image attachment]");
	assert.equal(entry?.thinking, "reason");
});

test("compaction events retain durable summaries and render aborted and failed terminal states", () => {
	const { ingestEvent } = useSessionStore.getState();
	ingestEvent({ type: "compaction_end", result: { compactedText: "durable summary" }, aborted: false });
	ingestEvent({
		type: "compaction_end",
		result: undefined,
		aborted: false,
		errorMessage: "Compaction failed: session too small",
	});
	ingestEvent({ type: "compaction_end", result: undefined, aborted: true, errorMessage: "cancelled" });
	assert.deepEqual(
		useSessionStore.getState().entries.map((entry) => [entry.kind, entry.text, entry.error]),
		[
			["compaction", "durable summary", undefined],
			["compaction", "Context compaction failed", "Compaction failed: session too small"],
			["compaction", "Context compaction aborted", "cancelled"],
		],
	);
});

test("entry_appended shows durable extension custom entries", () => {
	useSessionStore.getState().ingestEvent({
		type: "entry_appended",
		entry: {
			type: "custom",
			id: "custom",
			parentId: null,
			timestamp: "2026-01-01T00:00:00Z",
			customType: "workflow",
			data: { runId: "r1" },
		},
	});
	assert.deepEqual(
		useSessionStore.getState().entries.map((entry) => [entry.id, entry.kind, entry.customType]),
		[["custom", "custom", "workflow"]],
	);
});

test("hydrateTranscript honors a compaction first-kept boundary", () => {
	useSessionStore.getState().hydrateTranscript(
		[
			{ type: "message", id: "old-user", parentId: null, message: { role: "user", content: "old" } },
			{ type: "message", id: "kept-user", parentId: "old-user", message: { role: "user", content: "keep" } },
			{
				type: "message",
				id: "kept-assistant",
				parentId: "kept-user",
				message: { role: "assistant", content: "kept reply" },
			},
			{
				type: "compaction",
				id: "compact",
				parentId: "kept-assistant",
				summary: "Earlier context",
				firstKeptEntryId: "kept-user",
			},
			{ type: "message", id: "after", parentId: "compact", message: { role: "user", content: "after" } },
		],
		"after",
	);
	assert.deepEqual(
		useSessionStore.getState().entries.map((entry) => entry.id),
		["compact", "kept-user", "kept-assistant", "after"],
	);
});
