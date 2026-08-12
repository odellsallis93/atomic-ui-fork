import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";
import { createInMemoryTestBackend, setDurableBackend } from "../packages/workflows/src/durable/factory.js";
import { ENV_WORKFLOW_ARTIFACT_DIR } from "../packages/workflows/src/shared/workflow-artifact-env.js";

// Unit fixtures assert both colored and explicitly colorless rendering. Their
// default must be deterministic rather than inheriting a host application's
// NO_COLOR preference; tests covering that preference set it themselves.
delete process.env.NO_COLOR;

/**
 * Durable workflow artifacts (stage transcripts, ledgers, run notes) default to
 * the user's Atomic config root. Redirect them per test process so suites that
 * execute real builtin workflows cannot accumulate run directories in a
 * developer's home directory.
 */
process.env[ENV_WORKFLOW_ARTIFACT_DIR] ??= mkdtempSync(join(tmpdir(), "atomic-test-workflow-artifacts-"));

// Keep tests that instantiate a real settings/trust manager from touching a
// contributor's Atomic config directory. Individual tests that exercise
// inherited or unset configuration variables explicitly override this value.
process.env.ATOMIC_CODING_AGENT_DIR ??= mkdtempSync(join(tmpdir(), "atomic-test-agent-"));

/**
 * Product runtime always uses DBOS. Unit and integration tests explicitly run
 * against an isolated current-interface backend unless a test installs its own
 * DBOS adapter.
 */
beforeEach(() => {
	setDurableBackend(createInMemoryTestBackend());
});
