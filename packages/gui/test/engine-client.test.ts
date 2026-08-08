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
  if (msg.type === "prompt") {
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

		const result = await client.prompt({ message: "ping" });
		assert.equal(result.ok, true);
		assert.ok(events.some((event) => event.type === "message_update"));

		await client.stop();
	},
	ENGINE_CLIENT_SPAWN_TIMEOUT_MS,
);
