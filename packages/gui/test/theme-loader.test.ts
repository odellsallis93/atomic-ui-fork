import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { listThemes, loadThemeCss } from "../src/main/theme-loader.ts";

const paths: string[] = [];
function temp(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	paths.push(path);
	return path;
}
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

test("listThemes includes builtin dark and mocha themes", () => {
	const themes = listThemes();
	const names = themes.map((theme) => theme.name);
	assert.ok(names.includes("dark"));
	assert.ok(names.includes("catppuccin-mocha"));
	assert.ok(
		themes.every((theme) => theme.source === "builtin" || theme.source === "user" || theme.source === "project"),
	);
});

test("themes use JSON names and keep the first engine-precedence match", () => {
	const agent = temp("atomic-gui-themes-agent-");
	const cwd = temp("atomic-gui-themes-project-");
	mkdirSync(join(agent, "themes"), { recursive: true });
	mkdirSync(join(cwd, ".atomic", "themes"), { recursive: true });
	writeFileSync(
		join(agent, "themes", "user-file.json"),
		JSON.stringify({ name: "shared", colors: { accent: "#111111" } }),
	);
	writeFileSync(
		join(cwd, ".atomic", "themes", "project-file.json"),
		JSON.stringify({ name: "shared", colors: { accent: "#222222" } }),
	);
	const env = { ATOMIC_CODING_AGENT_DIR: agent };
	assert.deepEqual(
		listThemes(env, cwd).find((theme) => theme.name === "shared"),
		{
			name: "shared",
			source: "user",
			path: join(agent, "themes", "user-file.json"),
		},
	);
	assert.equal(loadThemeCss("shared", env, cwd).cssVariables["--atomic-accent"], "#111111");
});

test("project legacy .pi themes load after .atomic and live reload on next read", () => {
	const agent = temp("atomic-gui-themes-agent-");
	const cwd = temp("atomic-gui-themes-project-");
	mkdirSync(join(cwd, ".pi", "themes"), { recursive: true });
	const legacyTheme = join(cwd, ".pi", "themes", "legacy.json");
	writeFileSync(
		legacyTheme,
		JSON.stringify({ name: "legacy-pi", vars: { primary: 196 }, colors: { accent: "primary" } }),
	);
	const env = { ATOMIC_CODING_AGENT_DIR: agent };
	assert.equal(listThemes(env, cwd).find((theme) => theme.name === "legacy-pi")?.source, "project");
	assert.equal(loadThemeCss("legacy-pi", env, cwd).cssVariables["--atomic-accent"], "rgb(255, 0, 0)");
	writeFileSync(legacyTheme, JSON.stringify({ name: "legacy-pi", colors: { accent: 21 } }));
	assert.equal(loadThemeCss("legacy-pi", env, cwd).cssVariables["--atomic-accent"], "rgb(0, 0, 255)");
});

test("invalid themes are excluded and loadThemeCss maps Atomic tokens", () => {
	const agent = temp("atomic-gui-themes-agent-");
	mkdirSync(join(agent, "themes"), { recursive: true });
	writeFileSync(join(agent, "themes", "bad.json"), JSON.stringify({ name: "bad/name", colors: { accent: "#fff" } }));
	assert.equal(
		listThemes({ ATOMIC_CODING_AGENT_DIR: agent }).some((theme) => theme.name === "bad/name"),
		false,
	);
	const theme = loadThemeCss("dark");
	assert.equal(theme.name, "dark");
	assert.ok(theme.cssVariables["--atomic-accent"]);
	assert.ok(theme.cssVariables["--atomic-bashMode"]);
	assert.ok(theme.cssVariables["--atomic-toolDiffAdded"]);
});
