import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { defaultSessionDirForCwd, listSessions } from "../src/main/session-list.ts";

test("defaultSessionDirForCwd encodes cwd under the agent sessions root", () => {
	const dir = defaultSessionDirForCwd("/tmp/demo project", { ATOMIC_AGENT_DIR: "/tmp/agent-home" });
	assert.equal(dir, "/tmp/agent-home/sessions/--tmp-demo project--");
});

test("listSessions skips internal workflow sessions and sorts by modified", async () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-sessions-"));
	const sessionDir = join(root, "sessions", "--workspace--");
	mkdirSync(sessionDir, { recursive: true });
	const older = join(sessionDir, "old.jsonl");
	const newer = join(sessionDir, "new.jsonl");
	const internal = join(sessionDir, "workflow.jsonl");
	writeFileSync(
		older,
		`${JSON.stringify({ type: "session", id: "old", cwd: "/workspace", timestamp: 1 })}\n${JSON.stringify({ type: "message", message: { role: "user", content: "hello old" } })}\n`,
	);
	writeFileSync(
		newer,
		`${JSON.stringify({ type: "session", id: "new", cwd: "/workspace", name: "Named", timestamp: 2 })}\n${JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "hello new" }] } })}\n`,
	);
	writeFileSync(internal, `${JSON.stringify({ type: "session", id: "wf", cwd: "/workspace", internal: true })}\n`);

	const listed = await listSessions({
		cwd: "/workspace",
		env: { ATOMIC_AGENT_DIR: root },
	});
	assert.equal(listed.length, 2);
	assert.equal(listed[0]?.id, "new");
	assert.equal(listed[0]?.name, "Named");
	assert.equal(listed[0]?.firstMessage, "hello new");
	assert.equal(listed[1]?.id, "old");
});
