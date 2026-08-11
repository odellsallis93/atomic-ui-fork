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

test("project themes override user and builtin names, and reload on the next host read", () => {
	const agent = temp("atomic-gui-themes-agent-");
	const cwd = temp("atomic-gui-themes-project-");
	mkdirSync(join(agent, "themes"), { recursive: true });
	mkdirSync(join(cwd, ".atomic", "themes"), { recursive: true });
	writeFileSync(
		join(agent, "themes", "shared.json"),
		JSON.stringify({ name: "shared", colors: { accent: "#111111" } }),
	);
	const projectTheme = join(cwd, ".atomic", "themes", "shared.json");
	writeFileSync(projectTheme, JSON.stringify({ name: "shared", colors: { accent: "#222222" } }));
	const env = { ATOMIC_CODING_AGENT_DIR: agent };
	assert.deepEqual(
		listThemes(env, cwd).find((theme) => theme.name === "shared"),
		{
			name: "shared",
			source: "project",
			path: projectTheme,
		},
	);
	assert.equal(loadThemeCss("shared", env, cwd).cssVariables["--atomic-accent"], "#222222");
	writeFileSync(projectTheme, JSON.stringify({ name: "shared", colors: { accent: "#333333" } }));
	assert.equal(loadThemeCss("shared", env, cwd).cssVariables["--atomic-accent"], "#333333");
});

test("loadThemeCss maps Atomic tokens onto CSS custom properties", () => {
	const theme = loadThemeCss("dark");
	assert.equal(theme.name, "dark");
	assert.ok(theme.cssVariables["--atomic-accent"]);
	assert.ok(theme.cssVariables["--atomic-bashMode"]);
	assert.ok(theme.cssVariables["--atomic-toolDiffAdded"]);
});
