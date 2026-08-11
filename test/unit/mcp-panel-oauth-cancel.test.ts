import assert from "node:assert/strict";
import { test } from "vitest";
import { createMcpPanel } from "../../packages/mcp/mcp-panel.ts";

const CTRL_C = "\x03";
const RETURN = "\r";

test("MCP panel Ctrl+C cancels its in-flight OAuth owner and ignores a late result", async () => {
	let resolveAuth!: (result: { ok: boolean }) => void;
	const authentication = new Promise<{ ok: boolean }>((resolve) => {
		resolveAuth = resolve;
	});
	const cancelled: string[] = [];
	let renders = 0;
	let done = false;
	const panel = createMcpPanel(
		{ mcpServers: { oauth: { url: "https://example.test/mcp" } } },
		null,
		new Map(),
		{
			reconnect: async () => true,
			canAuthenticate: () => true,
			authenticate: async () => authentication,
			cancelAuthentication: (serverName) => cancelled.push(serverName),
			getConnectionStatus: () => "needs-auth",
			refreshCacheAfterReconnect: () => null,
		},
		{
			requestRender: () => {
				renders += 1;
			},
		},
		() => {
			done = true;
		},
		{ authOnly: true },
	);

	panel.handleInput(RETURN);
	panel.handleInput(CTRL_C);
	resolveAuth({ ok: true });
	await Promise.resolve();

	assert.deepEqual(cancelled, ["oauth"]);
	assert.equal(done, true);
	assert.equal(renders, 1, "a late OAuth result must not render after cancellation");
});
