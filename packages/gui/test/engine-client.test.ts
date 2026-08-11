import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { EngineClient } from "../src/main/engine-client.ts";
import { INTERACTIVE_ENGINE_PROTOCOL_VERSION } from "../src/main/jsonl.ts";
import { ENGINE_CLIENT_SPAWN_TIMEOUT_MS } from "../vitest.config.ts";

/**
 * Structural timeout: spawns a real child process that speaks a minimal
 * interactive-engine handshake over stdio.
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
}) + "\\n");
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type === "get_state") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_state",
      success: true,
      data: { sessionId: "s1", thinkingLevel: "off", model: { provider: "test", id: "tiny" } },
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
  if (msg.type === "get_entries") {
    process.stdout.write(JSON.stringify({
      id: msg.id,
      type: "response",
      command: "get_entries",
      success: true,
      data: { entries: [{ type: "message", message: { role: "user", content: "hello" } }], leafId: "leaf-1" },
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
		assert.equal(status.protocolVersion, INTERACTIVE_ENGINE_PROTOCOL_VERSION);
		assert.equal(status.modelLabel, "test/tiny");

		const completions = await client.getCommandCompletions("mode", "fa");
		assert.deepEqual(completions, {
			ok: true,
			data: [{ value: "fast", label: "Fast mode", description: "Use the fast mode" }],
		});
		const entries = await client.getEntries();
		assert.deepEqual(entries, {
			ok: true,
			data: { entries: [{ type: "message", message: { role: "user", content: "hello" } }], leafId: "leaf-1" },
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

		await client.stop();
	},
	ENGINE_CLIENT_SPAWN_TIMEOUT_MS,
);
