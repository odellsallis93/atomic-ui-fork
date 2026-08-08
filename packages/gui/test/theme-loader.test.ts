import assert from "node:assert/strict";
import { test } from "vitest";
import { listThemes, loadThemeCss } from "../src/main/theme-loader.ts";

test("listThemes includes builtin dark and mocha themes", () => {
	const themes = listThemes();
	const names = themes.map((theme) => theme.name);
	assert.ok(names.includes("dark"));
	assert.ok(names.includes("catppuccin-mocha"));
	assert.ok(themes.every((theme) => theme.source === "builtin" || theme.source === "user"));
});

test("loadThemeCss maps Atomic tokens onto CSS custom properties", () => {
	const theme = loadThemeCss("dark");
	assert.equal(theme.name, "dark");
	assert.ok(theme.cssVariables["--atomic-accent"]);
	assert.ok(theme.cssVariables["--atomic-bashMode"]);
	assert.ok(theme.cssVariables["--atomic-toolDiffAdded"]);
});
