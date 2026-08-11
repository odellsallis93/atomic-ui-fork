import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface GuiSettingsSnapshot {
	theme: string;
	path: string;
	exists: boolean;
	globalPath: string;
	projectPath: string;
	globalExists: boolean;
	projectExists: boolean;
	/** True when project settings override the global theme, matching engine global→project precedence. */
	projectOverridesTheme: boolean;
}

function agentDir(env: NodeJS.ProcessEnv = process.env): string {
	const override =
		env.ATOMIC_CODING_AGENT_DIR?.trim() ||
		env.PI_CODING_AGENT_DIR?.trim() ||
		env.ATOMIC_AGENT_DIR?.trim() ||
		env.PI_AGENT_DIR?.trim();
	if (override) return resolve(override);
	return join(homedir(), ".atomic", "agent");
}

export function settingsPath(env: NodeJS.ProcessEnv = process.env): string {
	return join(agentDir(env), "settings.json");
}

export function projectSettingsPath(cwd = process.cwd()): string {
	return join(resolve(cwd), ".atomic", "settings.json");
}

function readTheme(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as { theme?: unknown };
		const theme = typeof raw.theme === "string" && raw.theme.trim() ? raw.theme.trim() : undefined;
		return theme && !theme.includes("/") ? theme : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read-only host snapshot of the effective GUI-visible settings. The engine remains
 * the mutation authority; this mirrors its global→project file precedence only for
 * the currently supported GUI theme selector.
 */
export function readGuiSettings(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): GuiSettingsSnapshot {
	const globalPath = settingsPath(env);
	const projectPath = projectSettingsPath(cwd);
	const globalTheme = readTheme(globalPath);
	const projectTheme = readTheme(projectPath);
	return {
		theme: projectTheme ?? globalTheme ?? "dark",
		path: projectTheme ? projectPath : globalPath,
		exists: existsSync(projectPath) || existsSync(globalPath),
		globalPath,
		projectPath,
		globalExists: existsSync(globalPath),
		projectExists: existsSync(projectPath),
		projectOverridesTheme: projectTheme !== undefined,
	};
}
