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

type ColorValue = string | number;

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

function agentDirs(env: NodeJS.ProcessEnv = process.env): string[] {
	const override =
		env.ATOMIC_CODING_AGENT_DIR?.trim() ||
		env.PI_CODING_AGENT_DIR?.trim() ||
		env.ATOMIC_AGENT_DIR?.trim() ||
		env.PI_AGENT_DIR?.trim();
	if (override) return [resolve(override)];
	return [join(homedir(), ".atomic", "agent"), join(homedir(), ".pi", "agent")];
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

function projectThemeDirs(cwd: string): string[] {
	const root = resolve(cwd);
	return [join(root, ".atomic", "themes"), join(root, ".pi", "themes")];
}

function readThemeSummary(path: string, source: ThemeSummary["source"]): ThemeSummary | undefined {
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as { name?: unknown; colors?: unknown };
		if (typeof raw.name !== "string" || raw.name.trim() === "" || raw.name.includes("/")) return undefined;
		if (typeof raw.colors !== "object" || raw.colors === null) return undefined;
		return { name: raw.name.trim(), source, path };
	} catch {
		return undefined;
	}
}

function listJsonThemesInDir(dir: string, source: ThemeSummary["source"]): ThemeSummary[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".json") && name !== "theme-schema.json")
		.map((file) => readThemeSummary(join(dir, file), source))
		.filter((theme): theme is ThemeSummary => theme !== undefined);
}

/** Mirrors engine theme de-duping: themes are identified by JSON `name`, and the
 * first match wins in builtin → user (.atomic then legacy .pi) → project order. */
export function listThemes(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): ThemeSummary[] {
	const byName = new Map<string, ThemeSummary>();
	const add = (theme: ThemeSummary): void => {
		if (!byName.has(theme.name)) byName.set(theme.name, theme);
	};
	for (const theme of listJsonThemesInDir(builtinThemesDir(), "builtin")) add(theme);
	for (const dir of agentDirs(env).map((agentDir) => join(agentDir, "themes"))) {
		for (const theme of listJsonThemesInDir(dir, "user")) add(theme);
	}
	for (const dir of projectThemeDirs(cwd)) {
		for (const theme of listJsonThemesInDir(dir, "project")) add(theme);
	}
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

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
	if (clamped < 16) {
		const [r, g, b] = base[clamped]!;
		return `rgb(${r}, ${g}, ${b})`;
	}
	if (clamped < 232) {
		const value = clamped - 16;
		const channel = (n: number) => (n === 0 ? 0 : 55 + n * 40);
		const r = channel(Math.floor(value / 36));
		const g = channel(Math.floor((value % 36) / 6));
		const b = channel(value % 6);
		return `rgb(${r}, ${g}, ${b})`;
	}
	const gray = 8 + (clamped - 232) * 10;
	return `rgb(${gray}, ${gray}, ${gray})`;
}

function resolveColor(value: ColorValue, vars: Record<string, ColorValue>): string {
	if (typeof value === "number") return ansi256ToCss(value);
	if (!value) return "";
	if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) return value;
	const resolved = vars[value];
	if (resolved !== undefined) return resolveColor(resolved, vars);
	return value;
}

/** Reads current theme contents on every call. This gives custom user/project themes
 * reload on the next supported host refresh without inventing a watcher. */
export function loadThemeCss(
	name: string,
	env: NodeJS.ProcessEnv = process.env,
	cwd = process.cwd(),
): ResolvedThemeCss {
	const themes = listThemes(env, cwd);
	const match = themes.find((theme) => theme.name === name) ?? themes.find((theme) => theme.name === "dark");
	if (!match || !existsSync(match.path)) return { name: "dark", cssVariables: {} };
	const raw = JSON.parse(readFileSync(match.path, "utf8")) as {
		name?: unknown;
		vars?: Record<string, ColorValue>;
		colors?: Record<string, ColorValue>;
	};
	if (typeof raw.name !== "string" || typeof raw.colors !== "object" || raw.colors === null) {
		return { name: "dark", cssVariables: {} };
	}
	const vars = typeof raw.vars === "object" && raw.vars !== null ? raw.vars : {};
	const colors = raw.colors;
	const cssVariables: Record<string, string> = {};
	for (const key of THEME_TOKEN_KEYS) {
		const token = colors[key];
		if (typeof token !== "string" && typeof token !== "number") continue;
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
	return { name: raw.name, cssVariables };
}
