import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface GuiSettingsSnapshot {
	theme: string;
	path: string;
	exists: boolean;
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

export function readGuiSettings(env: NodeJS.ProcessEnv = process.env): GuiSettingsSnapshot {
	const path = settingsPath(env);
	if (!existsSync(path)) {
		return { theme: "dark", path, exists: false };
	}
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as { theme?: string };
		const theme = typeof raw.theme === "string" && raw.theme.trim() ? raw.theme.trim() : "dark";
		return { theme: theme.includes("/") ? "dark" : theme, path, exists: true };
	} catch {
		return { theme: "dark", path, exists: false };
	}
}

export function writeThemeSetting(theme: string, env: NodeJS.ProcessEnv = process.env): GuiSettingsSnapshot {
	const trimmed = theme.trim();
	if (!trimmed || trimmed.includes("/")) {
		throw new Error('Theme name must be a non-empty string without "/"');
	}
	const path = settingsPath(env);
	mkdirSync(dirname(path), { recursive: true });
	let existing: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			existing = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		} catch {
			existing = {};
		}
	}
	existing.theme = trimmed;
	writeFileSync(path, `${JSON.stringify(existing, null, "\t")}\n`, "utf8");
	return { theme: trimmed, path, exists: true };
}
