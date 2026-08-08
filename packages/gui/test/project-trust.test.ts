import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { applyTrustDecision, getTrustStatus, hasProjectTrustInputs } from "../src/main/project-trust.ts";

test("hasProjectTrustInputs detects AGENTS.md and .atomic resources", () => {
	const root = mkdtempSync(join(tmpdir(), "atomic-gui-trust-"));
	assert.equal(hasProjectTrustInputs(root), false);
	writeFileSync(join(root, "AGENTS.md"), "# hi\n");
	assert.equal(hasProjectTrustInputs(root), true);
});

test("applyTrustDecision persists trust.json and clears needsTrustPrompt", () => {
	const agent = mkdtempSync(join(tmpdir(), "atomic-gui-agent-"));
	const project = mkdtempSync(join(tmpdir(), "atomic-gui-project-"));
	mkdirSync(join(project, ".atomic"), { recursive: true });
	writeFileSync(join(project, ".atomic", "settings.json"), "{}\n");
	const env = { ATOMIC_AGENT_DIR: agent };

	const before = getTrustStatus(project, env);
	assert.equal(before.needsTrustPrompt, true);
	assert.equal(before.decision, null);

	const after = applyTrustDecision(project, "trust", env);
	assert.equal(after.decision, true);
	assert.equal(after.needsTrustPrompt, false);
});
