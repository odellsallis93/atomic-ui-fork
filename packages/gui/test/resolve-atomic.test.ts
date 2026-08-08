import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { resolveAtomicCli } from "../src/main/resolve-atomic.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("ATOMIC_GUI_CLI selects a compiled binary path", () => {
	const resolved = resolveAtomicCli({ ATOMIC_GUI_CLI: "/opt/atomic/bin/atomic" });
	assert.deepEqual(resolved, {
		runtimeExecutable: "/opt/atomic/bin/atomic",
		cliPath: "",
		runtimeArgs: [],
	});
});

test("ATOMIC_GUI_CLI_ENTRY prefers an explicit TypeScript entry under bun", () => {
	const resolved = resolveAtomicCli({
		ATOMIC_GUI_CLI_ENTRY: "/tmp/cli.ts",
	});
	assert.equal(resolved.runtimeExecutable, "bun");
	assert.equal(resolved.cliPath, "/tmp/cli.ts");
});

test("workspace resolution finds coding-agent sources in this monorepo", () => {
	const srcCli = join(repoRoot, "packages", "coding-agent", "src", "cli.ts");
	assert.equal(existsSync(srcCli), true);
	const resolved = resolveAtomicCli({});
	assert.ok(
		resolved.cliPath.endsWith("packages/coding-agent/src/cli.ts") ||
			resolved.cliPath.endsWith("packages/coding-agent/dist/cli.js") ||
			resolved.runtimeExecutable === "atomic",
	);
});
