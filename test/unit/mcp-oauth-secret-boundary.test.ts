import assert from "node:assert/strict";
import { test, vi } from "vitest";

vi.mock("../../packages/mcp/mcp-auth-flow.js", () => ({
	authenticate: async () => {
		throw new Error("access_token=TEST_SECRET");
	},
	cancelAuthentication: () => {},
	supportsOAuth: () => true,
	removeAuth: async () => {},
}));

const { authenticateServer } = await import("../../packages/mcp/commands.ts");

test("OAuth command keeps caught credential text out of notifications and results", async () => {
	const notices: string[] = [];
	const result = await authenticateServer("oauth", { mcpServers: { oauth: { url: "https://example.test/mcp" } } }, {
		hasUI: true,
		ui: {
			notify: (message: string) => notices.push(message),
			setStatus: () => {},
		},
	} as never);

	assert.equal(result.ok, false);
	assert.doesNotMatch(result.message ?? "", /TEST_SECRET|access_token/);
	assert.equal(notices.length, 1);
	assert.doesNotMatch(notices[0] ?? "", /TEST_SECRET|access_token/);
});
