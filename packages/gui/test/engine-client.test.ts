import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { EngineClient } from "../src/main/engine-client.ts";
import { INTERACTIVE_ENGINE_PROTOCOL_VERSION } from "../src/main/jsonl.ts";
import { ENGINE_CLIENT_SPAWN_TIMEOUT_MS } from "../vitest.config.ts";

/**
 * Fake-engine boundary (Phase 1.4):
 * Spawns a minimal child that speaks a synthetic interactive-engine handshake over
 * stdio. Proves EngineClient framing/RPC shape only — **not** parity with the real
 * Atomic engine. Real-engine lifecycle evidence: `real-engine-smoke.test.ts`.
 * Parity claims require real-engine or E2E rows in `docs/capability-ledger.md`.
 */
test(
	"EngineClient completes protocol handshake and prompt round-trip against a fake engine",
	async () => {
		const fakeEngine = join(tmpdir(), `atomic-gui-fake-engine-${process.pid}.mjs`);
		writeFileSync(
			fakeEngine,
			`import { createInterface } from "node:readline";
process.stdout.write(JSON.stringify({
  type: "engine_ready",
  protocolVersion: ${INTERACTIVE_ENGINE_PROTOCOL_VERSION},
  pid: process.pid,
	  hostInfo: { kind: "gui" },
}) + "\\n");
const rl = createInterface({ input: process.stdin });
let stateCalls = 0;
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type === "get_state") {
    const first = stateCalls++ === 0;
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_state",
      success: true,
      data: first ? { sessionFile: "/tmp/old.jsonl", sessionName: "OLD", thinkingLevel: "off", model: { provider: "test", id: "tiny" } } : {},
    }) + "\\n");
    return;
  }
  if (msg.type === "get_command_completions") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_command_completions",
      success: true,
      data: { completions: [{ value: "fast", label: "Fast mode", description: "Use the fast mode" }] },
    }) + "\\n");
    return;
  }
  if (msg.type === "autocomplete_query") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "autocomplete_query",
      success: true,
      data: { suggestions: [{ value: "fixture", label: "Fixture", text: "/fixture ", cursorOffset: 9 }] },
    }) + "\\n");
    return;
  }
  if (msg.type === "intercept_terminal_input") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "intercept_terminal_input",
      success: true,
      data: { consumed: false, data: msg.data === "x" ? "X" : undefined },
    }) + "\\n");
    return;
  }
  if (msg.type === "get_settings_snapshot" || msg.type === "reload_settings") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { theme: "dark", projectOverridesTheme: true, fastMode: { chat: false, workflow: false }, hideThinkingBlock: false, steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", autoCompactionEnabled: true, autoRetryEnabled: true, modelScopePatterns: [] } }) + "\\n");
    return;
  }
  if (msg.type === "set_fast_mode") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { theme: "dark", projectOverridesTheme: true, fastMode: { chat: msg.scope === "chat" ? msg.enabled : false, workflow: msg.scope === "workflow" ? msg.enabled : false }, hideThinkingBlock: false, steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", autoCompactionEnabled: true, autoRetryEnabled: true, modelScopePatterns: [] } }) + "\\n");
    return;
  }
  if (msg.type === "update_settings") {
    const operation = msg.operations[0];
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { theme: "dark", projectOverridesTheme: true, fastMode: { chat: operation.kind === "fast_mode" && operation.scope === "chat" ? operation.enabled : false, workflow: operation.kind === "fast_mode" && operation.scope === "workflow" ? operation.enabled : false }, hideThinkingBlock: operation.kind === "hide_thinking" ? operation.enabled : false, steeringMode: operation.kind === "steering_mode" ? operation.mode : "one-at-a-time", followUpMode: operation.kind === "follow_up_mode" ? operation.mode : "one-at-a-time", autoCompactionEnabled: operation.kind === "auto_compaction" ? operation.enabled : true, autoRetryEnabled: operation.kind === "auto_retry" ? operation.enabled : true, modelScopePatterns: operation.kind === "model_scope" ? operation.patterns : [] } }) + "\\n");
    return;
  }
  if (msg.type === "get_external_editor_command") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { command: "fixture-editor --wait" } }) + "\\n");
    return;
  }
  if (msg.type === "get_project_trust") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { cwd: "/workspace", needsTrustPrompt: true, decision: null, hasProjectResources: true } }) + "\\n");
    return;
  }
  if (msg.type === "get_project_trust_options") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { options: [{ id: "trust", label: "Trust", trusted: true, sessionOnly: false }, { id: "trust-session", label: "Trust (this session only)", trusted: true, sessionOnly: true }] } }) + "\\n");
    return;
  }
  if (msg.type === "set_project_trust") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { status: { cwd: "/workspace", needsTrustPrompt: false, decision: true, hasProjectResources: true }, ...(msg.optionId === "trust-session" ? { sessionOnly: true } : {}) } }) + "\\n");
    return;
  }
  if (msg.type === "new_session") {
    if (!msg.persist) throw new Error("GUI new_session must request durable persistence");
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true }) + "\\n");
    return;
  }
  if (msg.type === "delete_session") {
    if (!msg.persistReplacement) throw new Error("GUI active-session replacement must request durable persistence");
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true }) + "\\n");
    return;
  }
  if (msg.type === "rename_session") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true }) + "\\n");
    return;
  }
  if (msg.type === "list_themes") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { themes: [{ name: "dark", source: "builtin" }, { name: "fixture", source: "custom" }] } }) + "\\n");
    return;
  }
  if (["get_theme_snapshot", "set_theme"].includes(msg.type)) {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { name: msg.type === "set_theme" ? msg.name : "dark", cssVariables: { "--atomic-accent": "#123456" } } }) + "\\n");
    return;
  }
  if (msg.type === "get_entries") {
    if (msg.offset !== 250 || msg.limit !== 100) throw new Error("GUI transcript requests must preserve page bounds");
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_entries",
      success: true,
      data: { entries: [{ type: "message", message: { role: "user", content: "hello" } }], leafId: "leaf-1", total: 101, nextOffset: 350 },
    }) + "\\n");
    return;
  }
  if (msg.type === "list_sessions") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "list_sessions",
      success: true,
      data: {
        sessions: [{
          path: "/tmp/demo.jsonl",
          id: "demo",
          cwd: "/workspace",
          name: "Demo",
          modified: 42,
          created: 21,
          messageCount: 1,
          firstMessage: "hello",
        }],
        total: 1,
        nextOffset: null,
      },
    }) + "\\n");
    return;
  }
  if (msg.type === "get_shortcuts") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_shortcuts",
      success: true,
      data: { shortcuts: [{ key: "ctrl+k", description: "Run extension action" }] },
    }) + "\\n");
    return;
  }
  if (msg.type === "invoke_shortcut") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "invoke_shortcut",
      success: true,
    }) + "\\n");
    return;
  }
  if (msg.type === "get_commands") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_commands",
      success: true,
      data: { commands: [
        { name: "review", source: "extension", description: "Review" },
        { name: "brief", source: "prompt" },
        { name: "skill:tdd", source: "skill" },
        { name: "import", source: "builtin" },
      ] },
    }) + "\\n");
    return;
  }
  if (msg.type === "share_session") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "share_session",
      success: true,
      data: { gistUrl: "https://gist.github.com/test/abc123", shareUrl: "https://atomic.example/s/abc123" },
    }) + "\\n");
    return;
  }
  if (["get_fork_messages", "fork", "import_session", "set_label", "navigate_tree"].includes(msg.type)) {
    const data = msg.type === "get_fork_messages" ? { messages: [{ entryId: "u1", text: "fork here" }] }
      : msg.type === "fork" ? { text: "fork here", cancelled: false }
      : msg.type === "import_session" ? { cancelled: false }
      : msg.type === "navigate_tree" ? { cancelled: false, editorText: "edit me" } : undefined;
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data }) + "\\n");
    return;
  }
  if (msg.type === "get_available_models") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_available_models",
      success: true,
      data: {
        models: [{ provider: "test", id: "tiny", name: "Tiny" }, { provider: "test", id: "large" }],
        scopedModels: [{ model: { provider: "test", id: "tiny", name: "Tiny" }, thinkingLevel: "low" }],
		apiKeyProviders: [{ id: "test", name: "Test Provider" }],
        oauthProviders: [{ id: "test", name: "Test Provider", loginLabel: "Sign in" }],
		logoutProviders: ["test"],
      },
    }) + "\\n");
    return;
  }
  if (msg.type === "get_available_thinking_levels") {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true, data: { levels: ["off", "low", "high"] } }) + "\\n");
    return;
  }
  if (["set_thinking_level", "set_steering_mode", "set_follow_up_mode", "set_auto_compaction", "set_auto_retry"].includes(msg.type)) {
    process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: msg.type, success: true }) + "\\n");
    return;
  }
  if (msg.type === "accepted_timeout") {
    process.stdout.write(JSON.stringify({ type: "engine_request_accepted", requestId: msg.id, command: msg.type }) + "\\n");
    return;
  }
  if (msg.type === "prompt") {
		if (Array.isArray(msg.images) && msg.images.length > 0) {
			process.stdout.write(JSON.stringify({ type: "prompt_image_received", image: msg.images[0] }) + "\\n");
		}
    process.stdout.write(JSON.stringify({
      type: "message_start",
      message: { id: "a1", role: "assistant", content: [] },
    }) + "\\n");
    process.stdout.write(JSON.stringify({
      type: "message_update",
      message: { id: "a1", role: "assistant", content: [] },
      assistantMessageEvent: { type: "text_delta", delta: "pong" },
    }) + "\\n");
    process.stdout.write(JSON.stringify({
      type: "message_end",
      message: { id: "a1", role: "assistant", content: [{ type: "text", text: "pong" }] },
    }) + "\\n");
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "prompt",
      success: true,
    }) + "\\n");
  }
});
`,
			"utf8",
		);

		const events: Array<{ type: string }> = [];
		const client = new EngineClient({
			cli: { runtimeExecutable: process.execPath, cliPath: fakeEngine, runtimeArgs: [] },
			onEvent: (event) => events.push(event),
		});

		const status = await client.start();
		assert.equal(status.state, "ready");
		assert.equal(status.hostKind, "gui");
		assert.equal(status.protocolVersion, INTERACTIVE_ENGINE_PROTOCOL_VERSION);
		assert.equal(status.modelLabel, "test/tiny");
		const cleared = await client.refreshState();
		assert.equal(cleared.ok, true);
		assert.equal(cleared.data?.sessionFile, undefined);
		assert.equal(cleared.data?.sessionName, undefined);
		assert.equal(cleared.data?.modelLabel, undefined);
		assert.equal(cleared.data?.thinkingLevel, undefined);

		const completions = await client.getCommandCompletions("mode", "fa");
		assert.deepEqual(completions, {
			ok: true,
			data: [{ value: "fast", label: "Fast mode", description: "Use the fast mode" }],
		});
		assert.deepEqual(await client.getAutocomplete("/fi", 3), {
			ok: true,
			data: [{ value: "fixture", label: "Fixture", text: "/fixture ", cursorOffset: 9 }],
		});
		assert.deepEqual(await client.interceptTerminalInput("x"), { ok: true, data: { consumed: false, data: "X" } });
		assert.deepEqual(await client.getSettingsSnapshot(), {
			ok: true,
			data: {
				theme: "dark",
				projectOverridesTheme: true,
				fastMode: { chat: false, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: [],
			},
		});
		assert.deepEqual(await client.reloadSettings(), {
			ok: true,
			data: {
				theme: "dark",
				projectOverridesTheme: true,
				fastMode: { chat: false, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: [],
			},
		});
		assert.deepEqual(await client.setFastMode("chat", true), {
			ok: true,
			data: {
				theme: "dark",
				projectOverridesTheme: true,
				fastMode: { chat: true, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: [],
			},
		});
		assert.deepEqual(await client.updateSettings([{ kind: "steering_mode", mode: "all" }]), {
			ok: true,
			data: {
				theme: "dark",
				projectOverridesTheme: true,
				fastMode: { chat: false, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "all",
				followUpMode: "one-at-a-time",
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: [],
			},
		});
		assert.deepEqual(await client.updateSettings([{ kind: "model_scope", patterns: ["fixture/model"] }]), {
			ok: true,
			data: {
				theme: "dark",
				projectOverridesTheme: true,
				fastMode: { chat: false, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: ["fixture/model"],
			},
		});
		assert.deepEqual(await client.getExternalEditorCommand(), { ok: true, data: "fixture-editor --wait" });
		assert.deepEqual(await client.getProjectTrust(), {
			ok: true,
			data: { cwd: "/workspace", needsTrustPrompt: true, decision: null, hasProjectResources: true },
		});
		assert.deepEqual(await client.getProjectTrustOptions(), {
			ok: true,
			data: [
				{ id: "trust", label: "Trust", trusted: true, sessionOnly: false },
				{ id: "trust-session", label: "Trust (this session only)", trusted: true, sessionOnly: true },
			],
		});
		assert.deepEqual(await client.setProjectTrust("trust-session"), {
			ok: true,
			data: {
				status: { cwd: "/workspace", needsTrustPrompt: false, decision: true, hasProjectResources: true },
				sessionOnly: true,
			},
		});
		assert.deepEqual(await client.newSession(), { ok: true, data: undefined });
		assert.deepEqual(await client.deleteSession("/tmp/fixture.jsonl"), { ok: true, data: undefined });
		assert.deepEqual(await client.renameSession("/tmp/fixture.jsonl", "fixture"), { ok: true, data: undefined });
		assert.deepEqual(await client.listThemes(), {
			ok: true,
			data: [
				{ name: "dark", source: "builtin" },
				{ name: "fixture", source: "custom" },
			],
		});
		assert.deepEqual(await client.getThemeSnapshot(), {
			ok: true,
			data: { name: "dark", cssVariables: { "--atomic-accent": "#123456" } },
		});
		assert.deepEqual(await client.setTheme("fixture"), {
			ok: true,
			data: { name: "fixture", cssVariables: { "--atomic-accent": "#123456" } },
		});
		const entries = await client.getEntries({ offset: 250, limit: 100 });
		assert.deepEqual(entries, {
			ok: true,
			data: {
				entries: [{ type: "message", message: { role: "user", content: "hello" } }],
				leafId: "leaf-1",
				total: 101,
				nextOffset: 350,
			},
		});
		assert.deepEqual(await client.listSessions({ all: true }), {
			ok: true,
			data: [
				{
					path: "/tmp/demo.jsonl",
					id: "demo",
					cwd: "/workspace",
					name: "Demo",
					modified: 42,
					created: 21,
					messageCount: 1,
					firstMessage: "hello",
				},
			],
		});
		const shortcuts = await client.getShortcuts();
		assert.deepEqual(shortcuts, {
			ok: true,
			data: [{ key: "ctrl+k", description: "Run extension action" }],
		});
		assert.deepEqual(await client.invokeShortcut("ctrl+k"), { ok: true, data: undefined });
		assert.deepEqual(await client.getCommands(), {
			ok: true,
			data: [
				{ name: "review", source: "extension", description: "Review" },
				{ name: "brief", source: "prompt" },
				{ name: "skill:tdd", source: "skill" },
			],
		});
		assert.deepEqual(await client.getForkMessages(), { ok: true, data: [{ entryId: "u1", text: "fork here" }] });
		assert.deepEqual(await client.forkSession("u1"), { ok: true, data: { text: "fork here", cancelled: false } });
		assert.deepEqual(await client.importSession("/tmp/import.jsonl"), { ok: true, data: { cancelled: false } });
		assert.deepEqual(await client.navigateTree("u1", { label: "keep" }), {
			ok: true,
			data: { cancelled: false, editorText: "edit me" },
		});
		assert.deepEqual(await client.setTreeLabel("u1", "kept"), { ok: true, data: undefined });
		assert.deepEqual(await client.shareSession(), {
			ok: true,
			data: { gistUrl: "https://gist.github.com/test/abc123", shareUrl: "https://atomic.example/s/abc123" },
		});

		assert.deepEqual(await client.getAuthCatalog(), {
			ok: true,
			data: {
				models: [
					{ provider: "test", id: "tiny", name: "Tiny", scoped: true, scopedThinkingLevel: "low" },
					{ provider: "test", id: "large" },
				],
				scopedModels: [
					{
						model: { provider: "test", id: "tiny", name: "Tiny", scoped: true, scopedThinkingLevel: "low" },
						thinkingLevel: "low",
					},
				],
				apiKeyProviders: [{ id: "test", name: "Test Provider" }],
				oauthProviders: [
					{ id: "test", name: "Test Provider", loginLabel: "Sign in", usesCallbackServer: undefined },
				],
				logoutProviders: ["test"],
				providers: ["test"],
			},
		});
		assert.deepEqual(await client.getAvailableThinkingLevels(), { ok: true, data: ["off", "low", "high"] });
		assert.deepEqual(await client.setThinkingLevel("low"), { ok: true, data: undefined });
		assert.deepEqual(await client.setSteeringMode("one-at-a-time"), { ok: true, data: undefined });
		assert.deepEqual(await client.setFollowUpMode("all"), { ok: true, data: undefined });
		assert.deepEqual(await client.setAutoCompaction(true), { ok: true, data: undefined });
		assert.deepEqual(await client.setAutoRetry(false), { ok: true, data: undefined });

		const result = await client.prompt({
			message: "ping",
			images: [{ type: "image", data: "cGl4ZWw=", mimeType: "image/png" }],
		});
		assert.equal(result.ok, true);
		assert.ok(events.some((event) => event.type === "message_update"));
		assert.deepEqual(
			events.find((event) => event.type === "prompt_image_received"),
			{
				type: "prompt_image_received",
				image: { type: "image", data: "cGl4ZWw=", mimeType: "image/png" },
			},
		);
		const acceptedTimeout = await client.runEngineCommand({ type: "accepted_timeout" }, 25);
		assert.deepEqual(acceptedTimeout, {
			ok: false,
			error: "Timed out waiting for accepted_timeout",
			requestAccepted: true,
		});

		await client.stop();
	},
	ENGINE_CLIENT_SPAWN_TIMEOUT_MS,
);
