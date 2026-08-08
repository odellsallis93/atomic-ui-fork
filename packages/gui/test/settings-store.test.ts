import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { readGuiSettings, writeThemeSetting } from "../src/main/settings-store.ts";

test("writeThemeSetting persists theme and readGuiSettings rounds trips", () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-settings-"));
	const env = { ATOMIC_AGENT_DIR: root };
	const before = readGuiSettings(env);
	assert.equal(before.exists, false);
	assert.equal(before.theme, "dark");

	const written = writeThemeSetting("catppuccin-mocha", env);
	assert.equal(written.exists, true);
	assert.equal(written.theme, "catppuccin-mocha");

	const after = readGuiSettings(env);
	assert.equal(after.theme, "catppuccin-mocha");
});
