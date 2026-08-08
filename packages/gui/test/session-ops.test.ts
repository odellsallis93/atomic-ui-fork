import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { deleteSessionFile, renameSessionFile } from "../src/main/session-ops.ts";

test("renameSessionFile appends session_info and rejects empty names", async () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-rename-"));
	const path = join(root, "session.jsonl");
	writeFileSync(
		path,
		`${JSON.stringify({ type: "session", id: "abc", cwd: "/tmp", timestamp: 1 })}\n${JSON.stringify({ type: "message", id: "m1", parentId: null, message: { role: "user", content: "hi" } })}\n`,
	);

	const empty = await renameSessionFile(path, "   ");
	assert.equal(empty.ok, false);

	const renamed = await renameSessionFile(path, "My Session");
	assert.equal(renamed.ok, true);
	const text = readFileSync(path, "utf8");
	assert.match(text, /"type":"session_info"/);
	assert.match(text, /"name":"My Session"/);
});

test("deleteSessionFile unlinks when trash is unavailable", async () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-delete-"));
	mkdirSync(root, { recursive: true });
	const path = join(root, "gone.jsonl");
	writeFileSync(path, `${JSON.stringify({ type: "session", id: "x" })}\n`);
	const result = await deleteSessionFile(path);
	assert.equal(result.ok, true);
	assert.throws(() => readFileSync(path));
});
