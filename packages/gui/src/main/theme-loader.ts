import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ThemeSummary {
	name: string;
	source: "builtin" | "user" | "project";
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
	return override ? resolve(override) : join(homedir(), ".atomic", "agent");
}

function builtinThemesDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(here, "../../../coding-agent/src/modes/interactive/theme"),
		join(here, "../../../../coding-agent/src/modes/interactive/theme"),
		join(process.cwd(), "packages/coding-agent/src/modes/interactive/theme"),
	];
	return candidates.find((candidate) => existsSync(join(candidate, "dark.json"))) ?? candidates[0]!;
}

/** Engine resource loading searches project config directories. The GUI host only
 * reads the canonical project `.atomic/themes` directory; configured theme paths
 * stay engine-owned and are intentionally not guessed here. */
function projectThemesDir(cwd: string): string {
	return join(resolve(cwd), ".atomic", "themes");
}

function listJsonThemesInDir(dir: string, source: ThemeSummary["source"]): ThemeSummary[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".json") && name !== "theme-schema.json")
		.map((file) => ({ name: file.replace(/\.json$/, ""), source, path: join(dir, file) }));
}

/** Mirrors engine resource precedence for the directories the host can safely inspect:
 * builtins < user themes < project `.atomic/themes`. Later sources win by theme name. */
export function listThemes(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): ThemeSummary[] {
	const byName = new Map<string, ThemeSummary>();
	for (const theme of listJsonThemesInDir(builtinThemesDir(), "builtin")) byName.set(theme.name, theme);
	for (const theme of listJsonThemesInDir(join(agentDir(env), "themes"), "user")) byName.set(theme.name, theme);
	for (const theme of listJsonThemesInDir(projectThemesDir(cwd), "project")) byName.set(theme.name, theme);
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function resolveColor(value: string, vars: Record<string, string>): string {
	if (!value) return "";
	if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) return value;
	return vars[value] ?? value;
}

/** Reads current theme contents on every call. This gives custom user/project themes
 * TUI-equivalent reload on the next supported host refresh without watching builtins. */
export function loadThemeCss(
	name: string,
	env: NodeJS.ProcessEnv = process.env,
	cwd = process.cwd(),
): ResolvedThemeCss {
	const themes = listThemes(env, cwd);
	const match = themes.find((theme) => theme.name === name) ?? themes.find((theme) => theme.name === "dark");
	if (!match || !existsSync(match.path)) return { name: "dark", cssVariables: {} };
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
