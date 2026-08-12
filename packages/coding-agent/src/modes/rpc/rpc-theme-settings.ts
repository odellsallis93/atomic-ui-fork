// The public SettingsManager entrypoint installs its accessor mixins. Keep
// this inside the optional RPC host so the standalone TUI remains unaffected.
import "../../core/settings-manager.ts";
import type { AgentSession } from "../../core/agent-session.ts";
import { resolveModelScopeWithDiagnostics } from "../../core/model-resolver.ts";
import type { SettingsManager } from "../../core/settings-manager-core.ts";
import {
	getAvailableThemesWithPaths,
	getBuiltinThemes,
	loadThemeJson,
	setRegisteredThemes,
} from "../interactive/theme/theme-loading.ts";
import type { ColorValue } from "../interactive/theme/theme-schema.ts";

export interface RpcThemeSummary {
	name: string;
	source: "builtin" | "custom";
}

export interface RpcResolvedThemeSnapshot {
	name: string;
	cssVariables: Record<string, string>;
}

export interface RpcSettingsSnapshot {
	theme: string;
	projectOverridesTheme: boolean;
	fastMode: { chat: boolean; workflow: boolean };
	hideThinkingBlock: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	autoCompactionEnabled: boolean;
	autoRetryEnabled: boolean;
	/** Configured model patterns; an empty list means all available models. */
	modelScopePatterns: string[];
}

export type RpcSettingsOperation =
	| { kind: "fast_mode"; scope: "chat" | "workflow"; enabled: boolean }
	| { kind: "steering_mode"; mode: "all" | "one-at-a-time" }
	| { kind: "follow_up_mode"; mode: "all" | "one-at-a-time" }
	| { kind: "auto_compaction"; enabled: boolean }
	| { kind: "auto_retry"; enabled: boolean }
	| { kind: "hide_thinking"; enabled: boolean }
	| { kind: "model_scope"; patterns: string[] };

const CSS_ALIASES: Record<string, string> = {
	text: "--text",
	accent: "--blue",
	muted: "--overlay1",
	selectedBg: "--surface0",
	border: "--surface1",
	error: "--red",
	success: "--green",
	warning: "--yellow",
};

function ansi256ToCss(index: number): string {
	const clamped = Math.max(0, Math.min(255, Math.trunc(index)));
	const base = [
		[0, 0, 0],
		[128, 0, 0],
		[0, 128, 0],
		[128, 128, 0],
		[0, 0, 128],
		[128, 0, 128],
		[0, 128, 128],
		[192, 192, 192],
		[128, 128, 128],
		[255, 0, 0],
		[0, 255, 0],
		[255, 255, 0],
		[0, 0, 255],
		[255, 0, 255],
		[0, 255, 255],
		[255, 255, 255],
	] as const;
	if (clamped < base.length) {
		const [red, green, blue] = base[clamped]!;
		return `rgb(${red}, ${green}, ${blue})`;
	}
	if (clamped < 232) {
		const value = clamped - 16;
		const channel = (component: number) => (component === 0 ? 0 : 55 + component * 40);
		return `rgb(${channel(Math.floor(value / 36))}, ${channel(Math.floor((value % 36) / 6))}, ${channel(value % 6)})`;
	}
	const gray = 8 + (clamped - 232) * 10;
	return `rgb(${gray}, ${gray}, ${gray})`;
}

function resolveColor(value: ColorValue, variables: Record<string, ColorValue>, seen = new Set<string>()): string {
	if (typeof value === "number") return ansi256ToCss(value);
	if (value === "" || value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) return value;
	if (seen.has(value)) return "";
	const variable = variables[value];
	if (variable === undefined) return value;
	seen.add(value);
	return resolveColor(variable, variables, seen);
}

function synchronizeRpcThemes(session?: AgentSession): void {
	const themes = session?.resourceLoader?.getThemes().themes;
	if (themes) setRegisteredThemes(themes);
}

function resolveThemeName(settingsManager: SettingsManager): string {
	const configured = settingsManager.getThemeSetting();
	if (configured && getAvailableThemesWithPaths().some((theme) => theme.name === configured)) return configured;
	return "dark";
}

export function getRpcThemeSummaries(session?: AgentSession): RpcThemeSummary[] {
	synchronizeRpcThemes(session);
	const builtins = getBuiltinThemes();
	return getAvailableThemesWithPaths().map((theme) => ({
		name: theme.name,
		source: theme.name in builtins ? "builtin" : "custom",
	}));
}

export function getRpcSettingsSnapshot(settingsManager: SettingsManager, session?: AgentSession): RpcSettingsSnapshot {
	synchronizeRpcThemes(session);
	return {
		theme: resolveThemeName(settingsManager),
		projectOverridesTheme: settingsManager.getProjectSettings().theme !== undefined,
		fastMode: settingsManager.getCodexFastModeSettings(),
		hideThinkingBlock: settingsManager.getHideThinkingBlock(),
		steeringMode: settingsManager.getSteeringMode(),
		followUpMode: settingsManager.getFollowUpMode(),
		autoCompactionEnabled: settingsManager.getCompactionEnabled(),
		autoRetryEnabled: settingsManager.getRetryEnabled(),
		modelScopePatterns: settingsManager.getEnabledModels() ?? [],
	};
}

function assertQueueMode(value: unknown, setting: string): asserts value is "all" | "one-at-a-time" {
	if (value !== "all" && value !== "one-at-a-time") {
		throw new Error(`${setting} must be "all" or "one-at-a-time"`);
	}
}

function assertBoolean(value: unknown, setting: string): asserts value is boolean {
	if (typeof value !== "boolean") throw new Error(`${setting} must be a boolean`);
}

/** Apply only supported settings operations through the engine-owned manager. */
export async function updateRpcSettings(
	session: AgentSession,
	operations: RpcSettingsOperation[],
): Promise<RpcSettingsSnapshot> {
	if (!Array.isArray(operations) || operations.length === 0) {
		throw new Error("At least one settings operation is required");
	}
	const validated: Array<{
		operation: RpcSettingsOperation;
		scopedModels?: AgentSession["scopedModels"];
	}> = [];
	for (const operation of operations) {
		if (!operation || typeof operation !== "object") throw new Error("Invalid settings operation");
		switch (operation.kind) {
			case "fast_mode":
				if (operation.scope !== "chat" && operation.scope !== "workflow")
					throw new Error("Invalid fast-mode scope");
				assertBoolean(operation.enabled, "Fast mode");
				validated.push({ operation });
				break;
			case "steering_mode":
				assertQueueMode(operation.mode, "Steering mode");
				validated.push({ operation });
				break;
			case "follow_up_mode":
				assertQueueMode(operation.mode, "Follow-up mode");
				validated.push({ operation });
				break;
			case "auto_compaction":
				assertBoolean(operation.enabled, "Auto compaction");
				validated.push({ operation });
				break;
			case "auto_retry":
				assertBoolean(operation.enabled, "Auto retry");
				validated.push({ operation });
				break;
			case "hide_thinking":
				assertBoolean(operation.enabled, "Hide thinking");
				validated.push({ operation });
				break;
			case "model_scope": {
				if (!Array.isArray(operation.patterns)) throw new Error("Model scope patterns must be an array");
				if (operation.patterns.length > 100) throw new Error("Model scope supports at most 100 patterns");
				const patterns = operation.patterns.map((pattern) => {
					if (typeof pattern !== "string") throw new Error("Model scope patterns must be strings");
					const trimmed = pattern.trim();
					if (!trimmed) throw new Error("Model scope patterns cannot be empty");
					return trimmed;
				});
				const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(
					patterns,
					session.modelRuntime,
				);
				if (diagnostics.length > 0) {
					throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join("; "));
				}
				validated.push({ operation: { kind: "model_scope", patterns }, scopedModels });
				break;
			}
			default:
				throw new Error("Unsupported settings operation");
		}
	}
	for (const { operation, scopedModels } of validated) {
		switch (operation.kind) {
			case "fast_mode":
				session.settingsManager.setCodexFastModeSettings({ [operation.scope]: operation.enabled });
				break;
			case "steering_mode":
				session.setSteeringMode(operation.mode);
				break;
			case "follow_up_mode":
				session.setFollowUpMode(operation.mode);
				break;
			case "auto_compaction":
				session.setAutoCompactionEnabled(operation.enabled);
				break;
			case "auto_retry":
				session.setAutoRetryEnabled(operation.enabled);
				break;
			case "hide_thinking":
				session.settingsManager.setHideThinkingBlock(operation.enabled);
				break;
			case "model_scope":
				session.settingsManager.setEnabledModels(operation.patterns.length > 0 ? operation.patterns : undefined);
				session.setScopedModels([...(scopedModels ?? [])]);
				break;
		}
	}
	return getRpcSettingsSnapshot(session.settingsManager, session);
}

export function getRpcResolvedThemeSnapshot(name: string, session?: AgentSession): RpcResolvedThemeSnapshot {
	synchronizeRpcThemes(session);
	const theme = loadThemeJson(name);
	const variables = theme.vars ?? {};
	const cssVariables: Record<string, string> = {};
	for (const [key, value] of Object.entries(theme.colors)) {
		const resolved = resolveColor(value, variables);
		if (!resolved) continue;
		cssVariables[`--atomic-${key}`] = resolved;
		const alias = CSS_ALIASES[key];
		if (alias) cssVariables[alias] = resolved;
	}
	return { name: theme.name, cssVariables };
}

export function setRpcTheme(
	settingsManager: SettingsManager,
	name: string,
	session?: AgentSession,
): RpcResolvedThemeSnapshot {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Theme name cannot be empty");
	const snapshot = getRpcResolvedThemeSnapshot(trimmed, session);
	settingsManager.setTheme(snapshot.name);
	return snapshot;
}
