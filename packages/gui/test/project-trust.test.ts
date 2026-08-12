import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
	getRpcProjectTrustOptions,
	getRpcProjectTrustStatus,
	setRpcProjectTrust,
} from "../../coding-agent/src/modes/rpc/rpc-project-trust.ts";

test("engine trust status detects AGENTS.md and .atomic resources", () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-trust-"));
	const agent = mkdtempSync(join(tmpdir(), "atomic-gui-agent-"));
	assert.equal(getRpcProjectTrustStatus(root, agent).hasProjectResources, false);
	writeFileSync(join(root, "AGENTS.md"), "# hi\n");
	assert.equal(getRpcProjectTrustStatus(root, agent).hasProjectResources, true);
});

test("engine project-trust mutation persists without exposing a trust-store path", () => {
	const agent = mkdtempSync(join(tmpdir(), "atomic-gui-agent-"));
	const project = mkdtempSync(join(tmpdir(), "atomic-gui-project-"));
	mkdirSync(join(project, ".atomic"), { recursive: true });
	writeFileSync(join(project, ".atomic", "settings.json"), "{}\n");

	const before = getRpcProjectTrustStatus(project, agent);
	assert.equal(before.needsTrustPrompt, true);
	assert.equal(before.decision, null);

	const options = getRpcProjectTrustOptions(project);
	assert.ok(options.some((option) => option.id === "trust" && option.sessionOnly === false));
	assert.equal(JSON.stringify(options).includes("path"), false);
	const after = setRpcProjectTrust(project, "trust", agent);
	assert.equal(after.status.decision, true);
	assert.equal(after.status.needsTrustPrompt, false);
});
