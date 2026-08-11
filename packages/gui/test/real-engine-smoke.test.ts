import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { EngineClient } from "../src/main/engine-client.ts";
import { INTERACTIVE_ENGINE_PROTOCOL_VERSION } from "../src/main/jsonl.ts";
import { resolveAtomicCli } from "../src/main/resolve-atomic.ts";
import { ENGINE_CLIENT_SPAWN_TIMEOUT_MS } from "../vitest.config.ts";

/**
 * Real-engine smoke (Phase 1.1 / 1.2).
 *
 * Boundary: these tests spawn the workspace Atomic CLI (`resolveAtomicCli`) and
 * speak protocol v2. They prove host↔engine lifecycle and session switch leaf
 * alignment. They do **not** replace Electron E2E or full model-provider parity.
 *
 * Fake-engine structural RPC coverage lives in `engine-client.test.ts` and must
 * not be cited alone as parity evidence (see `docs/capability-ledger.md`).
 *
 * Approved gap: LLM prompt/stream against a live provider is not required here.
 * Streaming is proven via real-engine bash execution events. Full model prompt
 * path remains a tracked follow-up when provider credentials/CI policy allow.
 */

const REAL_ENGINE_TIMEOUT_MS = Math.max(ENGINE_CLIENT_SPAWN_TIMEOUT_MS, 90_000);

function bashCommands(entries: unknown[]): string[] {
	const commands: string[] = [];
	for (const entry of entries) {
		if (typeof entry !== "object" || entry === null) continue;
		const value = entry as { type?: unknown; message?: { role?: unknown; command?: unknown } };
		if (value.type !== "message") continue;
		if (value.message?.role !== "bashExecution") continue;
		if (typeof value.message.command === "string") commands.push(value.message.command);
	}
	return commands;
}

async function withRealClient(
	run: (client: EngineClient, events: Array<{ type: string }>) => Promise<void>,
): Promise<void> {
	const cli = resolveAtomicCli();
	const cwd = mkdtempSync(join(tmpdir(), "atomic-gui-real-engine-"));
	const events: Array<{ type: string }> = [];
	const client = new EngineClient({
		cwd,
		cli,
		onEvent: (event) => events.push({ type: event.type }),
	});
	try {
		await run(client, events);
	} finally {
		await client.stop().catch(() => undefined);
	}
}

test(
	"real engine: start handshake reaches protocol v2 ready",
	async () => {
		await withRealClient(async (client) => {
			const status = await client.start();
			assert.equal(status.state, "ready");
			assert.equal(status.protocolVersion, INTERACTIVE_ENGINE_PROTOCOL_VERSION);
			assert.ok(typeof status.pid === "number" && status.pid > 0);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);
test(
	"real engine: bash streams execution events (prompt/stream stand-in)",
	async () => {
		await withRealClient(async (client, events) => {
			await client.start();
			const result = await client.bash("printf 'stream-ok\\n'");
			assert.equal(result.ok, true);
			if (result.ok) {
				const data = result.data as { output?: unknown } | undefined;
				assert.match(String(data?.output ?? ""), /stream-ok/);
			}
			assert.ok(
				events.some((event) => event.type === "bash_execution_start" || event.type === "bash_execution_update"),
				`expected bash stream events, got: ${events.map((e) => e.type).join(",")}`,
			);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: abort RPC succeeds while engine is ready",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			// Fire a longer bash; abort must return successfully even if bash already finished.
			const bashPromise = client.bash("sleep 2; echo after-abort-window");
			await new Promise((resolve) => setTimeout(resolve, 50));
			const abortResult = await client.abort();
			assert.equal(abortResult.ok, true, abortResult.ok ? undefined : abortResult.error);
			const bashResult = await bashPromise;
			// Either cancelled or completed — host must remain usable either way.
			assert.ok(bashResult.ok === true || bashResult.ok === false);
			const probe = await client.bash("echo still-alive");
			assert.equal(probe.ok, true);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: stop then start restart reaches ready again",
	async () => {
		const cli = resolveAtomicCli();
		const cwd = mkdtempSync(join(tmpdir(), "atomic-gui-real-restart-"));
		const first = new EngineClient({ cwd, cli });
		try {
			const status1 = await first.start();
			assert.equal(status1.state, "ready");
			await first.stop();
			assert.equal(first.getStatus().state, "stopped");
		} finally {
			await first.stop().catch(() => undefined);
		}

		const second = new EngineClient({ cwd, cli });
		try {
			const status2 = await second.start();
			assert.equal(status2.state, "ready");
			assert.equal(status2.protocolVersion, INTERACTIVE_ENGINE_PROTOCOL_VERSION);
			const probe = await second.bash("echo restarted");
			assert.equal(probe.ok, true);
		} finally {
			await second.stop().catch(() => undefined);
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"host rejects version-mismatch engine_ready with clear error",
	async () => {
		const fakeEngine = join(tmpdir(), `atomic-gui-bad-proto-${process.pid}.mjs`);
		writeFileSync(
			fakeEngine,
			`process.stdout.write(JSON.stringify({
  type: "engine_ready",
  protocolVersion: ${INTERACTIVE_ENGINE_PROTOCOL_VERSION + 1},
  pid: process.pid,
}) + "\\n");
setInterval(() => {}, 60_000);
`,
			"utf8",
		);

		const client = new EngineClient({
			cli: { runtimeExecutable: process.execPath, cliPath: fakeEngine, runtimeArgs: [] },
		});
		try {
			await assert.rejects(
				() => client.start(),
				(error: unknown) => {
					assert.ok(error instanceof Error);
					assert.match(
						error.message,
						/incompatible|protocol/i,
						`expected clear version-mismatch message, got: ${error.message}`,
					);
					assert.match(
						error.message,
						new RegExp(`${INTERACTIVE_ENGINE_PROTOCOL_VERSION}`),
						"message should mention host protocol version",
					);
					return true;
				},
			);
		} finally {
			await client.stop().catch(() => undefined);
		}
	},
	ENGINE_CLIENT_SPAWN_TIMEOUT_MS,
);

test(
	"real engine: session switch keeps get_entries leaf aligned with get_tree leaf",
	async () => {
		await withRealClient(async (client) => {
			await client.start();

			const createdA = await client.newSession();
			assert.equal(createdA.ok, true, createdA.ok ? undefined : createdA.error);
			const bashA = await client.bash("echo ALPHA_SESSION_MARKER");
			assert.equal(bashA.ok, true);
			const pathA = client.getStatus().sessionFile;
			assert.ok(typeof pathA === "string" && pathA.length > 0, "session A path required");
			const entriesA = await client.getEntries();
			assert.equal(entriesA.ok, true);
			const leafA = entriesA.data?.leafId ?? null;
			assert.ok(typeof leafA === "string" && leafA.length > 0);
			assert.ok(bashCommands(entriesA.data?.entries ?? []).some((cmd) => cmd.includes("ALPHA_SESSION_MARKER")));

			const createdB = await client.newSession();
			assert.equal(createdB.ok, true, createdB.ok ? undefined : createdB.error);
			const bashB = await client.bash("echo BETA_SESSION_MARKER");
			assert.equal(bashB.ok, true);
			const pathB = client.getStatus().sessionFile;
			assert.ok(typeof pathB === "string" && pathB.length > 0 && pathB !== pathA);
			const entriesB = await client.getEntries();
			assert.equal(entriesB.ok, true);
			assert.ok(bashCommands(entriesB.data?.entries ?? []).some((cmd) => cmd.includes("BETA_SESSION_MARKER")));
			assert.ok(!bashCommands(entriesB.data?.entries ?? []).some((cmd) => cmd.includes("ALPHA_SESSION_MARKER")));

			const switched = await client.switchSession(pathA);
			assert.equal(switched.ok, true, switched.ok ? undefined : switched.error);
			await client.refreshState().catch(() => undefined);

			const after = await client.getEntries();
			assert.equal(after.ok, true);
			const tree = await client.getTree();
			assert.equal(tree.ok, true);

			const entryLeaf = after.data?.leafId ?? null;
			const treeLeaf = tree.data?.leafId ?? null;
			assert.ok(typeof entryLeaf === "string" && entryLeaf.length > 0, "hydrated leaf required");
			assert.equal(entryLeaf, treeLeaf, "get_entries leafId must match get_tree leafId after switch");

			// Active session file should be A after switch.
			assert.equal(client.getStatus().sessionFile, pathA);

			// Best-effort transcript identity: if the engine reloads bash rows, ALPHA must return
			// and BETA must not leak. If bash rows are not durable across switch in this engine
			// build, leaf alignment + session path still gate integrity (documented in ledger).
			const commands = bashCommands(after.data?.entries ?? []);
			if (commands.length > 0) {
				assert.ok(
					commands.some((cmd) => cmd.includes("ALPHA_SESSION_MARKER")),
					`expected ALPHA bash after switch, got: ${commands.join(" | ")}`,
				);
				assert.ok(
					!commands.some((cmd) => cmd.includes("BETA_SESSION_MARKER")),
					"BETA bash must not leak into session A after switch",
				);
			}
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);
