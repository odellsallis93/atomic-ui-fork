import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ResolvedAtomicCli {
	/** Executable that runs the CLI (bun, node, or a compiled binary). */
	runtimeExecutable: string;
	/** Path to the CLI entry, or empty when runtimeExecutable is the binary. */
	cliPath: string;
	runtimeArgs: string[];
}

function findRepoRoot(start: string): string | undefined {
	let current = start;
	for (let i = 0; i < 8; i += 1) {
		if (existsSync(join(current, "packages", "coding-agent", "package.json"))) return current;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return undefined;
}

/**
 * Resolve the Atomic CLI the GUI should supervise.
 *
 * Preference order:
 * 1. `ATOMIC_GUI_CLI` — full path to a compiled `atomic` binary
 * 2. `ATOMIC_GUI_CLI_ENTRY` + runtime — path to cli.js / cli.ts
 * 3. Workspace `packages/coding-agent/dist/cli.js` under node
 * 4. Workspace `packages/coding-agent/src/cli.ts` under bun
 * 5. `atomic` on PATH (compiled binary)
 */
export function resolveAtomicCli(env: NodeJS.ProcessEnv = process.env): ResolvedAtomicCli {
	const binary = env.ATOMIC_GUI_CLI?.trim();
	if (binary) {
		return { runtimeExecutable: binary, cliPath: "", runtimeArgs: [] };
	}

	const entry = env.ATOMIC_GUI_CLI_ENTRY?.trim();
	if (entry) {
		const runtime = env.ATOMIC_GUI_RUNTIME?.trim() || (entry.endsWith(".ts") ? "bun" : "node");
		return { runtimeExecutable: runtime, cliPath: entry, runtimeArgs: [] };
	}

	const here = dirname(fileURLToPath(import.meta.url));
	const repoRoot = findRepoRoot(here) ?? findRepoRoot(process.cwd());
	if (repoRoot) {
		const distCli = join(repoRoot, "packages", "coding-agent", "dist", "cli.js");
		if (existsSync(distCli)) {
			return { runtimeExecutable: process.execPath, cliPath: distCli, runtimeArgs: [] };
		}
		const srcCli = join(repoRoot, "packages", "coding-agent", "src", "cli.ts");
		if (existsSync(srcCli)) {
			return { runtimeExecutable: "bun", cliPath: srcCli, runtimeArgs: [] };
		}
	}

	return { runtimeExecutable: "atomic", cliPath: "", runtimeArgs: [] };
}
