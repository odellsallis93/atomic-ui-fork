import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentSession } from "../../packages/coding-agent/src/core/agent-session.ts";
import type { AgentSessionRuntime } from "../../packages/coding-agent/src/core/agent-session-runtime.ts";
import { SettingsManager } from "../../packages/coding-agent/src/core/settings-manager-core.ts";
import { InMemorySettingsStorage } from "../../packages/coding-agent/src/core/settings-storage.ts";
import { createRpcCommandHandler } from "../../packages/coding-agent/src/modes/rpc/rpc-command-handler.ts";
import {
	getRpcResolvedThemeSnapshot,
	getRpcSettingsSnapshot,
	getRpcThemeSummaries,
	setRpcTheme,
} from "../../packages/coding-agent/src/modes/rpc/rpc-theme-settings.ts";

test("engine theme snapshot exposes resolved CSS tokens without filesystem paths", () => {
	const snapshot = getRpcResolvedThemeSnapshot("dark");
	assert.equal(snapshot.name, "dark");
	assert.equal(typeof snapshot.cssVariables["--atomic-accent"], "string");
	assert.equal(typeof snapshot.cssVariables["--blue"], "string");
	assert.equal(
		Object.keys(snapshot.cssVariables).some((key) => key.includes("path")),
		false,
	);
});

test("engine theme catalog labels builtin themes without exposing their paths", () => {
	const dark = getRpcThemeSummaries().find((theme) => theme.name === "dark");
	assert.deepEqual(dark, { name: "dark", source: "builtin" });
	assert.equal("path" in (dark ?? {}), false);
});

test("theme mutation validates through the engine settings manager", () => {
	const settings = SettingsManager.inMemory({ theme: "dark" });
	const result = setRpcTheme(settings, "catppuccin-mocha");
	assert.equal(result.name, "catppuccin-mocha");
	assert.equal(settings.getThemeSetting(), "catppuccin-mocha");
	assert.throws(() => setRpcTheme(settings, "does-not-exist"), /Theme not found/);
});

test("settings snapshot reports the effective engine theme", () => {
	const settings = SettingsManager.inMemory({ theme: "catppuccin-mocha" });
	assert.deepEqual(getRpcSettingsSnapshot(settings), {
		theme: "catppuccin-mocha",
		projectOverridesTheme: false,
		fastMode: { chat: false, workflow: false },
		hideThinkingBlock: false,
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		autoCompactionEnabled: true,
		autoRetryEnabled: true,
		modelScopePatterns: [],
	});
});

test("typed theme RPC persists only a validated engine-owned selection", async () => {
	const settingsManager = SettingsManager.inMemory({ theme: "dark" });
	const session = { settingsManager } as AgentSession;
	const runtimeHost = { services: { agentDir: "/fixture" } } as AgentSessionRuntime;
	const handle = createRpcCommandHandler({
		runtimeHost,
		getSession: () => session,
		rebindSession: async () => {},
		output: () => {},
	});

	const before = await handle({ id: "settings", type: "get_settings_snapshot" });
	assert.deepEqual("data" in before! ? before.data : undefined, {
		theme: "dark",
		projectOverridesTheme: false,
		fastMode: { chat: false, workflow: false },
		hideThinkingBlock: false,
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		autoCompactionEnabled: true,
		autoRetryEnabled: true,
		modelScopePatterns: [],
	});

	const selected = await handle({ id: "theme", type: "set_theme", name: "catppuccin-mocha" });
	assert.equal(selected?.success, true);
	assert.equal(settingsManager.getThemeSetting(), "catppuccin-mocha");

	const fastMode = await handle({ id: "fast", type: "set_fast_mode", scope: "chat", enabled: true });
	assert.deepEqual("data" in fastMode! ? fastMode.data : undefined, {
		theme: "catppuccin-mocha",
		projectOverridesTheme: false,
		fastMode: { chat: true, workflow: false },
		hideThinkingBlock: false,
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		autoCompactionEnabled: true,
		autoRetryEnabled: true,
		modelScopePatterns: [],
	});

	await assert.rejects(() => handle({ id: "invalid", type: "set_theme", name: "not-a-theme" }), /Theme not found/);
});

test("reload_settings re-resolves engine settings without exposing a settings path", async () => {
	const storage = new InMemorySettingsStorage();
	storage.withLock("global", () => JSON.stringify({ theme: "dark" }));
	const settingsManager = SettingsManager.fromStorage(storage);
	const session = {
		settingsManager,
		resourceLoader: { reload: async () => {}, getThemes: () => ({ themes: [], diagnostics: [] }) },
	} as unknown as AgentSession;
	const runtimeHost = { services: { agentDir: "/fixture" } } as AgentSessionRuntime;
	const handle = createRpcCommandHandler({
		runtimeHost,
		getSession: () => session,
		rebindSession: async () => {},
		output: () => {},
	});

	storage.withLock("global", () => JSON.stringify({ theme: "catppuccin-mocha" }));
	const reloaded = await handle({ id: "reload", type: "reload_settings" });
	assert.deepEqual("data" in reloaded! ? reloaded.data : undefined, {
		theme: "catppuccin-mocha",
		projectOverridesTheme: false,
		fastMode: { chat: false, workflow: false },
		hideThinkingBlock: false,
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		autoCompactionEnabled: true,
		autoRetryEnabled: true,
		modelScopePatterns: [],
	});
});

test("settings operation RPC validates and persists the supported GUI controls", async () => {
	const settingsManager = SettingsManager.inMemory({ theme: "dark" });
	const model = {
		provider: "fixture",
		id: "scope-model",
		name: "Scoped fixture",
	} as AgentSession["scopedModels"][number]["model"];
	let appliedScope: AgentSession["scopedModels"] = [];
	const session = {
		settingsManager,
		modelRuntime: { getAvailableSnapshot: () => [model] },
		setSteeringMode: (mode: "all" | "one-at-a-time") => settingsManager.setSteeringMode(mode),
		setFollowUpMode: (mode: "all" | "one-at-a-time") => settingsManager.setFollowUpMode(mode),
		setAutoCompactionEnabled: (enabled: boolean) => settingsManager.setCompactionEnabled(enabled),
		setAutoRetryEnabled: (enabled: boolean) => settingsManager.setRetryEnabled(enabled),
		setScopedModels: (scope: AgentSession["scopedModels"]) => {
			appliedScope = scope;
		},
	} as unknown as AgentSession;
	const runtimeHost = { services: { agentDir: "/fixture" } } as AgentSessionRuntime;
	const handle = createRpcCommandHandler({
		runtimeHost,
		getSession: () => session,
		rebindSession: async () => {},
		output: () => {},
	});

	const updated = await handle({
		id: "update",
		type: "update_settings",
		operations: [
			{ kind: "fast_mode", scope: "workflow", enabled: true },
			{ kind: "steering_mode", mode: "all" },
			{ kind: "follow_up_mode", mode: "all" },
			{ kind: "auto_compaction", enabled: false },
			{ kind: "auto_retry", enabled: false },
			{ kind: "hide_thinking", enabled: true },
			{ kind: "model_scope", patterns: ["fixture/scope-model"] },
		],
	});
	assert.deepEqual("data" in updated! ? updated.data : undefined, {
		theme: "dark",
		projectOverridesTheme: false,
		fastMode: { chat: false, workflow: true },
		hideThinkingBlock: true,
		steeringMode: "all",
		followUpMode: "all",
		autoCompactionEnabled: false,
		autoRetryEnabled: false,
		modelScopePatterns: ["fixture/scope-model"],
	});
	assert.deepEqual(
		appliedScope.map(({ model: scoped }) => `${scoped.provider}/${scoped.id}`),
		["fixture/scope-model"],
	);
	await assert.rejects(
		() => handle({ id: "invalid", type: "update_settings", operations: [] }),
		/At least one settings operation/,
	);
	await assert.rejects(
		() =>
			handle({
				id: "invalid-value",
				type: "update_settings",
				operations: [{ kind: "auto_retry", enabled: "yes" } as never],
			}),
		/Auto retry must be a boolean/,
	);
	await assert.rejects(
		() =>
			handle({
				id: "invalid-batch",
				type: "update_settings",
				operations: [
					{ kind: "fast_mode", scope: "chat", enabled: true },
					{ kind: "auto_retry", enabled: "invalid" } as never,
				],
			}),
		/Auto retry must be a boolean/,
	);
	assert.deepEqual(getRpcSettingsSnapshot(settingsManager), {
		theme: "dark",
		projectOverridesTheme: false,
		fastMode: { chat: false, workflow: true },
		hideThinkingBlock: true,
		steeringMode: "all",
		followUpMode: "all",
		autoCompactionEnabled: false,
		autoRetryEnabled: false,
		modelScopePatterns: ["fixture/scope-model"],
	});
	await assert.rejects(
		() =>
			handle({
				id: "invalid-scope",
				type: "update_settings",
				operations: [{ kind: "model_scope", patterns: ["missing"] }],
			}),
		/No models match pattern/,
	);
});
