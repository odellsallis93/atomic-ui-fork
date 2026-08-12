import assert from "node:assert/strict";
import { test } from "vitest";
import { FooterDataProvider } from "../../packages/coding-agent/src/core/footer-data-provider.js";
import { SettingsManager } from "../../packages/coding-agent/src/core/settings-manager-core.ts";
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

test("isolated GUI extensions receive an opt-in host descriptor while retaining TUI mode", () => {
	const ui = createRpcExtensionUIContext({
		output: () => {},
		pendingExtensionRequests: new Map(),
		hostInfo: { kind: "gui" },
	});
	assert.deepEqual(ui.hostInfo, { kind: "gui" });
});

test("isolated extension UI registers autocomplete wrappers with the engine query service", () => {
	let registered = 0;
	const ui = createRpcExtensionUIContext({
		output: () => {},
		pendingExtensionRequests: new Map(),
		onAddAutocompleteProvider: () => {
			registered += 1;
		},
	});
	ui.addAutocompleteProvider((current) => current);
	assert.equal(registered, 1);
});

test("isolated extension UI registers terminal interception handlers with the engine", () => {
	let handler: ((data: string) => { consume?: boolean } | undefined) | undefined;
	const ui = createRpcExtensionUIContext({
		output: () => {},
		pendingExtensionRequests: new Map(),
		onTerminalInput: (registered) => {
			handler = registered;
			return () => {
				handler = undefined;
			};
		},
	});
	const unsubscribe = ui.onTerminalInput(() => ({ consume: true }));
	assert.deepEqual(handler?.("\u001b"), { consume: true });
	unsubscribe();
	assert.equal(handler, undefined);
});

test("isolated extension UI exposes and switches engine themes", () => {
	const settingsManager = SettingsManager.inMemory({ theme: "dark" });
	const requests: Array<{ type?: string; method?: string; name?: string }> = [];
	const ui = createRpcExtensionUIContext({
		output: (message) => requests.push(message),
		pendingExtensionRequests: new Map(),
		settingsManager,
	});
	assert.ok(ui.getAllThemes().some((candidate) => candidate.name === "dark"));
	assert.equal(ui.getTheme("dark")?.name, "dark");
	assert.deepEqual(ui.setTheme("catppuccin-mocha"), { success: true });
	assert.equal(settingsManager.getThemeSetting(), "catppuccin-mocha");
	assert.equal(ui.setTheme("does-not-exist").success, false);
	assert.deepEqual(ui.setTheme("dark"), { success: true });
	assert.deepEqual(
		requests.map(({ type, method, name }) => ({ type, method, name })),
		[
			{ type: "extension_ui_request", method: "setTheme", name: "catppuccin-mocha" },
			{ type: "extension_ui_request", method: "setTheme", name: "dark" },
		],
	);
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

test("isolated editor dialogs retain timeout and abort semantics", async () => {
	const requests: Array<Record<string, unknown>> = [];
	const pending = new Map();
	const ui = createRpcExtensionUIContext({
		output: (request) => requests.push(request as Record<string, unknown>),
		pendingExtensionRequests: pending,
	});
	const controller = new AbortController();
	const result = ui.editor("Timed editor", "draft", { timeout: 25, signal: controller.signal });
	assert.deepEqual(
		requests.map(({ method, title, prefill, timeout }) => ({ method, title, prefill, timeout })),
		[{ method: "editor", title: "Timed editor", prefill: "draft", timeout: 25 }],
	);
	assert.equal(pending.size, 1);
	controller.abort();
	assert.equal(await result, undefined);
	assert.equal(pending.size, 0);
});
