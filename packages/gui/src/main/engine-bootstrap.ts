import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Mirrors packages/coding-agent/src/utils/interactive-engine-bootstrap.ts so the
 * GUI host can launch an isolated engine child without bundling the CLI.
 */
export const INTERACTIVE_ENGINE_BOOTSTRAP_FLAG = "--internal-engine-bootstrap";
export const INTERACTIVE_ENGINE_BOOTSTRAP_VERSION = 1;

export interface InteractiveEngineBootstrapHandle {
	readonly path: string;
	readonly directory: string;
}

export function writeInteractiveEngineBootstrap(record: {
	hostPid: number;
	guardFile: string;
	apiKey?: string;
}): InteractiveEngineBootstrapHandle {
	const directory = mkdtempSync(join(tmpdir(), "atomic-gui-engine-bootstrap-"));
	const path = join(directory, "bootstrap.json");
	const tempPath = `${path}.tmp`;
	const payload = {
		version: INTERACTIVE_ENGINE_BOOTSTRAP_VERSION,
		hostPid: record.hostPid,
		guardFile: record.guardFile,
		...(record.apiKey ? { apiKey: record.apiKey } : {}),
	};
	try {
		writeFileSync(tempPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
		renameSync(tempPath, path);
	} catch (error) {
		rmSync(tempPath, { force: true });
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}
	return { path, directory };
}

export function removeOwnedInteractiveEngineBootstrap(handle: InteractiveEngineBootstrapHandle | undefined): void {
	if (!handle) return;
	rmSync(handle.directory, { recursive: true, force: true });
}
