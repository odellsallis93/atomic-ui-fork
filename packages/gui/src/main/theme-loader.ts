import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ThemeSummary {
	name: string;
	source: "builtin" | "user";
	path: string;
}

export interface ResolvedThemeCss {
	name: string;
	cssVariables: Record<string, string>;
}

const THEME_TOKEN_KEYS = [
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"selectedBg",
	"userMessageBg",
	"userMessageText",
	"customMessageBg",
	"customMessageText",
	"customMessageLabel",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"bashMode",
] as const;

function agentDir(env: NodeJS.ProcessEnv = process.env): string {
	const override =
		env.ATOMIC_CODING_AGENT_DIR?.trim() ||
		env.PI_CODING_AGENT_DIR?.trim() ||
		env.ATOMIC_AGENT_DIR?.trim() ||
		env.PI_AGENT_DIR?.trim();
	if (override) return resolve(override);
	return join(homedir(), ".atomic", "agent");
}

function builtinThemesDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(here, "../../../coding-agent/src/modes/interactive/theme"),
		join(here, "../../../../coding-agent/src/modes/interactive/theme"),
		join(process.cwd(), "packages/coding-agent/src/modes/interactive/theme"),
	];
	for (const candidate of candidates) {
		if (existsSync(join(candidate, "dark.json"))) return candidate;
	}
	return candidates[0]!;
}

function listJsonThemesInDir(dir: string, source: "builtin" | "user"): ThemeSummary[] {
	if (!existsSync(dir)) return [];
	const out: ThemeSummary[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".json") || name === "theme-schema.json") continue;
		const themeName = name.replace(/\.json$/, "");
		out.push({ name: themeName, source, path: join(dir, name) });
	}
	return out;
}

export function listThemes(env: NodeJS.ProcessEnv = process.env): ThemeSummary[] {
	const builtin = listJsonThemesInDir(builtinThemesDir(), "builtin");
	const user = listJsonThemesInDir(join(agentDir(env), "themes"), "user");
	const byName = new Map<string, ThemeSummary>();
	for (const theme of builtin) byName.set(theme.name, theme);
	for (const theme of user) byName.set(theme.name, theme);
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function resolveColor(value: string, vars: Record<string, string>): string {
	if (!value) return "";
	if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) return value;
	return vars[value] ?? value;
}

export function loadThemeCss(name: string, env: NodeJS.ProcessEnv = process.env): ResolvedThemeCss {
	const themes = listThemes(env);
	const match = themes.find((theme) => theme.name === name) ?? themes.find((theme) => theme.name === "dark");
	if (!match || !existsSync(match.path)) {
		return { name: "dark", cssVariables: {} };
	}

	const raw = JSON.parse(readFileSync(match.path, "utf8")) as {
		name?: string;
		vars?: Record<string, string>;
		colors?: Record<string, string>;
	};
	const vars = raw.vars ?? {};
	const colors = raw.colors ?? {};
	const cssVariables: Record<string, string> = {};
	for (const key of THEME_TOKEN_KEYS) {
		const token = colors[key];
		if (typeof token !== "string") continue;
		const resolved = resolveColor(token, vars);
		if (resolved) cssVariables[`--atomic-${key}`] = resolved;
	}
	// Map a few high-traffic tokens onto the GUI shell variables already in styles.css.
	if (cssVariables["--atomic-text"]) cssVariables["--text"] = cssVariables["--atomic-text"];
	if (cssVariables["--atomic-accent"]) cssVariables["--blue"] = cssVariables["--atomic-accent"];
	if (cssVariables["--atomic-muted"]) cssVariables["--overlay1"] = cssVariables["--atomic-muted"];
	if (cssVariables["--atomic-selectedBg"]) cssVariables["--surface0"] = cssVariables["--atomic-selectedBg"];
	if (cssVariables["--atomic-border"]) cssVariables["--surface1"] = cssVariables["--atomic-border"];
	if (cssVariables["--atomic-error"]) cssVariables["--red"] = cssVariables["--atomic-error"];
	if (cssVariables["--atomic-success"]) cssVariables["--green"] = cssVariables["--atomic-success"];
	if (cssVariables["--atomic-warning"]) cssVariables["--yellow"] = cssVariables["--atomic-warning"];

	return { name: typeof raw.name === "string" ? raw.name : match.name, cssVariables };
}
