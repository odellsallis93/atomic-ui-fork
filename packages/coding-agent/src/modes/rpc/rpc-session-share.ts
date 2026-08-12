import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSession } from "../../core/agent-session.ts";
import { getShareViewerUrl } from "../../config.ts";

export interface RpcSessionShareResult {
	gistUrl: string;
	shareUrl: string;
}

interface GhResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

function runGh(args: string[]): Promise<GhResult> {
	return new Promise((resolve, reject) => {
		const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.once("error", reject);
		child.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function getGistId(gistUrl: string): string | undefined {
	try {
		const url = new URL(gistUrl);
		if (url.hostname !== "gist.github.com") return undefined;
		return url.pathname.split("/").filter(Boolean).at(-1);
	} catch {
		return undefined;
	}
}

/**
 * Export the active session and publish it as a secret GitHub gist. The engine
 * owns the `gh` interaction so the GUI never observes credential state or a
 * token. Only the two user-safe URLs cross the RPC boundary.
 */
export async function shareSessionAsSecretGist(session: AgentSession): Promise<RpcSessionShareResult> {
	const directory = await mkdtemp(join(tmpdir(), "atomic-session-share-"));
	const outputPath = join(directory, "session.html");
	try {
		let auth: GhResult;
		try {
			auth = await runGh(["auth", "status"]);
		} catch {
			throw new Error("GitHub CLI (gh) is not installed. Install it from https://cli.github.com/");
		}
		if (auth.code !== 0) throw new Error("GitHub CLI is not logged in. Run 'gh auth login' first.");

		await session.exportToHtml(outputPath);
		const result = await runGh(["gist", "create", "--public=false", outputPath]);
		if (result.code !== 0) {
			const detail = result.stderr.trim();
			throw new Error(detail ? `Failed to create gist: ${detail}` : "Failed to create gist");
		}
		const gistUrl = result.stdout.trim();
		const gistId = getGistId(gistUrl);
		if (!gistId) throw new Error("Failed to parse gist URL returned by GitHub CLI");
		return { gistUrl, shareUrl: getShareViewerUrl(gistId) };
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
