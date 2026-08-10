import assert from "node:assert/strict";
import { test } from "vitest";
import { FooterDataProvider } from "../../packages/coding-agent/src/core/footer-data-provider.js";
import type { EngineCustomUiService } from "../../packages/coding-agent/src/modes/interactive-engine/engine-custom-ui.ts";
import { createRpcExtensionUIContext } from "../../packages/coding-agent/src/modes/rpc/rpc-extension-ui.ts";

function createUI() {
	return createRpcExtensionUIContext({
		output: () => {},
		pendingExtensionRequests: new Map(),
	});
}

test("RPC extension UI keeps tool expansion and chat render settings in sync", () => {
	const ui = createUI();

	assert.equal(ui.getToolsExpanded(), false);
	assert.equal(ui.getChatRenderSettings().toolOutputExpanded, false);

	ui.setToolsExpanded(true);
	assert.equal(ui.getToolsExpanded(), true);
	assert.equal(ui.getChatRenderSettings().toolOutputExpanded, true);

	ui.setToolsExpanded(false);
	assert.equal(ui.getToolsExpanded(), false);
	assert.equal(ui.getChatRenderSettings().toolOutputExpanded, false);

	ui.setToolsExpanded(true);
	assert.equal(ui.getToolsExpanded(), true);
	assert.equal(ui.getChatRenderSettings().toolOutputExpanded, true);
});

test("isolated extension UI exposes live footer status and cached git data", () => {
	const provider = new FooterDataProvider(process.cwd());
	const ui = createRpcExtensionUIContext({
		output: () => {},
		pendingExtensionRequests: new Map(),
		footerDataProvider: provider,
	});

	assert.equal(ui.getFooterDataProvider(), provider);
	ui.setStatus("mcp", "MCP: 1/1 servers connected (3 tools)");
	assert.equal(ui.getFooterDataProvider().getExtensionStatuses().get("mcp"), "MCP: 1/1 servers connected (3 tools)");
	// getGitBranch() may legitimately be null (no git binary, detached HEAD),
	// so assert stability through the UI accessor instead of a non-null value:
	// repeated reads return the provider's cached result deterministically.
	const branch = provider.getGitBranch();
	assert.equal(ui.getFooterDataProvider().getGitBranch(), branch);
	assert.equal(ui.getFooterDataProvider().getGitBranch(), branch);

	ui.setStatus("mcp", undefined);
	assert.equal(ui.getFooterDataProvider().getExtensionStatuses().has("mcp"), false);
	provider.dispose();
});

test("setStatus invalidates isolated custom UI so mirrored status repaints", () => {
	const provider = new FooterDataProvider(process.cwd());
	let renderRequests = 0;
	const customUi = {
		requestRender: () => {
			renderRequests += 1;
		},
	} as unknown as EngineCustomUiService;
	const ui = createRpcExtensionUIContext({
		output: () => {},
		pendingExtensionRequests: new Map(),
		footerDataProvider: provider,
		customUi,
	});

	ui.setStatus("mcp", "MCP: 1/1 servers connected (3 tools)");
	assert.equal(renderRequests, 1, "status update must invalidate custom UI components");
	ui.setStatus("mcp", undefined);
	assert.equal(renderRequests, 2, "status clear must invalidate custom UI components");
	provider.dispose();
});

test("working indicator APIs emit host configuration", () => {
	const requests: Array<Record<string, unknown>> = [];
	const ui = createRpcExtensionUIContext({
		output: (request) => requests.push(request as Record<string, unknown>),
		pendingExtensionRequests: new Map(),
	});
	ui.setWorkingMessage("Indexing");
	ui.setWorkingVisible(false);
	ui.setWorkingIndicator({ frames: ["·", "•"], intervalMs: 120 });
	assert.deepEqual(
		requests.map(({ method, message, visible, frames, intervalMs }) => ({
			method,
			message,
			visible,
			frames,
			intervalMs,
		})),
		[
			{ method: "setWorking", message: "Indexing", visible: undefined, frames: undefined, intervalMs: undefined },
			{ method: "setWorking", message: undefined, visible: false, frames: undefined, intervalMs: undefined },
			{ method: "setWorking", message: undefined, visible: undefined, frames: ["·", "•"], intervalMs: 120 },
		],
	);
});

test("hidden-thinking label emits host configuration", () => {
	const requests: Array<Record<string, unknown>> = [];
	const ui = createRpcExtensionUIContext({
		output: (request) => requests.push(request as Record<string, unknown>),
		pendingExtensionRequests: new Map(),
	});
	ui.setHiddenThinkingLabel("Reasoning privately");
	assert.equal(requests[0]?.method, "setHiddenThinkingLabel");
	assert.equal(requests[0]?.label, "Reasoning privately");
});
