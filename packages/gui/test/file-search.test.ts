import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { searchFiles } from "../src/main/file-search.ts";

test("searchFiles finds nested matches and ignores node_modules", async () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-files-"));
	mkdirSync(join(root, "src"), { recursive: true });
	mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
	writeFileSync(join(root, "src", "alpha.ts"), "export {};\n");
	writeFileSync(join(root, "readme.md"), "# hi\n");
	writeFileSync(join(root, "node_modules", "pkg", "secret.ts"), "export {};\n");

	const hits = await searchFiles(root, "alpha");
	assert.equal(hits.length, 1);
	assert.equal(hits[0]?.path, "src/alpha.ts");
	const all = await searchFiles(root, "");
	assert.ok(all.some((item) => item.path === "readme.md"));
	assert.ok(!all.some((item) => item.path.includes("node_modules")));
});
