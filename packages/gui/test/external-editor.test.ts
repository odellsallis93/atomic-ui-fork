import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { editExternally } from "../src/main/external-editor.ts";

test("external editor uses VISUAL and returns its edited draft", async () => {
	const directory = mkdtempSync(join(tmpdir(), "atomic-gui-editor-test-"));
	const editor = join(directory, "editor.mjs");
	writeFileSync(editor, 'import { appendFileSync } from "node:fs"; appendFileSync(process.argv[2], " edited");\n');
	const result = await editExternally("draft", { VISUAL: `${process.execPath} ${editor}` });
	assert.deepEqual(result, { ok: true, text: "draft edited" });
});
