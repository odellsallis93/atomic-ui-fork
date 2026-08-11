import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { afterEach, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const electronMain = join(repoRoot, "packages/gui/out/main/index.js");
let app: ElectronApplication | undefined;

function writeProtocolFixture(): string {
	const path = join(mkdtempSync(join(tmpdir(), "atomic-gui-e2e-")), "engine.mjs");
	writeFileSync(
		path,
		`
let label = "";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const ok = (command, id, data = {}) => send({ type: "response", command, id, success: true, data });
const entries = () => ({ leafId: "leaf", entries: [
  { id: "root", type: "message", message: { role: "user", content: "fixture prompt" } },
  { id: "leaf", parentId: "root", type: "message", message: { role: "assistant", content: "fixture reply" } }
] });
send({ type: "engine_ready", protocolVersion: 2, pid: process.pid });
let input = "";
process.stdin.on("data", (chunk) => {
 input += chunk;
 for (;;) { const at = input.indexOf("\\n"); if (at < 0) break; const line = input.slice(0, at); input = input.slice(at + 1); if (!line) continue;
  const request = JSON.parse(line); const { type, id } = request;
  if (type === "get_state") ok(type, id, { sessionFile: "/tmp/fixture.jsonl", sessionName: "fixture", model: { provider: "fixture", id: "model" } });
  else if (type === "get_entries") ok(type, id, entries());
  else if (type === "get_tree") ok(type, id, { leafId: "leaf", nodes: [{ id: "root", kind: "message", summary: "fixture prompt", label, children: [{ id: "leaf", kind: "message", summary: "fixture reply", children: [] }] }] });
  else if (type === "get_fork_messages") ok(type, id, { messages: [{ entryId: "root", text: "fixture prompt" }] });
  else if (type === "prompt") { send({ type: "queue_update", queue: [{ id: "q1", message: "queued follow-up", streamingBehavior: "followUp" }] }); ok(type, id); }
  else if (type === "clear_queue") { ok(type, id, { steering: [], followUp: ["queued follow-up"] }); send({ type: "queue_update", queue: [] }); }
  else if (type === "compact") { send({ type: "compaction_end", result: { compactedText: "fixture boundary", tokensBefore: 12, stats: {}, parameters: {} } }); ok(type, id); }
  else if (type === "fork") ok(type, id, { text: "fork edit", cancelled: false });
  else if (type === "import_session" || type === "navigate_tree") ok(type, id, { editorText: "fixture prompt", cancelled: false });
  else if (type === "set_tree_label") { label = request.label || ""; ok(type, id); }
  else if (type === "get_commands") ok(type, id, { commands: [] });
  else if (type === "get_shortcuts") ok(type, id, { shortcuts: [] });
  else if (type === "get_available_models") ok(type, id, { models: [] });
  else if (type === "get_available_thinking_levels") ok(type, id, { levels: [] });
  else if (type === "get_session_stats") ok(type, id, {});
  else ok(type, id);
 }
});`,
		"utf8",
	);
	return path;
}

function editor(page: Page) {
	return page.locator(".composer-editor .cm-content");
}

afterEach(async () => {
	await app?.close().catch(() => undefined);
	app = undefined;
});

/** Electron fixture E2E: proves host launch, sandboxed renderer readiness, and composer focus only. */
test("Electron fixture E2E: host launch and composer focus", async () => {
	const fixture = writeProtocolFixture();
	const agentDir = mkdtempSync(join(tmpdir(), "atomic-gui-e2e-agent-"));
	const cwd = mkdtempSync(join(tmpdir(), "atomic-gui-e2e-cwd-"));
	app = await _electron.launch({
		args: [electronMain],
		cwd,
		env: {
			...process.env,
			ATOMIC_AGENT_DIR: agentDir,
			ATOMIC_GUI_CLI_ENTRY: fixture,
			ATOMIC_GUI_RUNTIME: process.execPath,
		},
	});
	const page = await app.firstWindow();
	await page.getByRole("button", { name: "Start engine" }).click();
	await page.getByText("ready", { exact: true }).waitFor();

	await editor(page).click();
	await page.keyboard.type("Electron fixture focus");
	assert.match((await editor(page).textContent()) ?? "", /Electron fixture focus/);
	assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest(".composer-editor"))), true);
}, 30_000);
