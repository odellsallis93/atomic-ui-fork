import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";
import { readGuiSettings } from "../src/main/settings-store.ts";

const paths: string[] = [];
function temp(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	paths.push(path);
	return path;
}
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

test("readGuiSettings mirrors engine global then project theme precedence without writing settings", () => {
	const agent = temp("atomic-gui-settings-agent-");
	const cwd = temp("atomic-gui-settings-project-");
	mkdirSync(join(agent), { recursive: true });
	mkdirSync(join(cwd, ".atomic"), { recursive: true });
	writeFileSync(join(agent, "settings.json"), JSON.stringify({ theme: "global-theme" }));
	writeFileSync(join(cwd, ".atomic", "settings.json"), JSON.stringify({ theme: "project-theme" }));

	const snapshot = readGuiSettings({ ATOMIC_AGENT_DIR: agent }, cwd);
	assert.equal(snapshot.theme, "project-theme");
	assert.equal(snapshot.projectOverridesTheme, true);
	assert.equal(snapshot.globalExists, true);
	assert.equal(snapshot.projectExists, true);
});

test("readGuiSettings falls back to global then dark for invalid or absent project theme", () => {
	const agent = temp("atomic-gui-settings-agent-");
	const cwd = temp("atomic-gui-settings-project-");
	mkdirSync(join(agent), { recursive: true });
	mkdirSync(join(cwd, ".atomic"), { recursive: true });
	writeFileSync(join(agent, "settings.json"), JSON.stringify({ theme: "global-theme" }));
	writeFileSync(join(cwd, ".atomic", "settings.json"), JSON.stringify({ theme: "bad/name" }));
	assert.equal(readGuiSettings({ ATOMIC_AGENT_DIR: agent }, cwd).theme, "global-theme");

	const emptyAgent = temp("atomic-gui-settings-empty-agent-");
	assert.equal(readGuiSettings({ ATOMIC_AGENT_DIR: emptyAgent }, cwd).theme, "dark");
});
