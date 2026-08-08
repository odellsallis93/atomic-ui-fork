import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile, unlink } from "node:fs/promises";

export interface DeleteSessionFileResult {
	ok: boolean;
	method: "trash" | "unlink";
	error?: string;
}

export interface RenameSessionFileResult {
	ok: boolean;
	error?: string;
}

/**
 * Delete a session file, trying the `trash` CLI first (TUI parity), then unlink.
 */
export async function deleteSessionFile(sessionPath: string): Promise<DeleteSessionFileResult> {
	if (!sessionPath || typeof sessionPath !== "string") {
		return { ok: false, method: "unlink", error: "Session path is required" };
	}
	if (!existsSync(sessionPath)) {
		return { ok: true, method: "unlink" };
	}

	const trashArgs = sessionPath.startsWith("-") ? ["--", sessionPath] : [sessionPath];
	const trashResult = spawnSync("trash", trashArgs, { encoding: "utf-8" });
	if (trashResult.status === 0 || !existsSync(sessionPath)) {
		return { ok: true, method: "trash" };
	}

	try {
		await unlink(sessionPath);
		return { ok: true, method: "unlink" };
	} catch (err) {
		const unlinkError = err instanceof Error ? err.message : String(err);
		const stderr = trashResult.stderr?.trim().split("\n")[0];
		const trashHint = trashResult.error?.message || stderr;
		return {
			ok: false,
			method: "unlink",
			error: trashHint ? `${unlinkError} (${trashHint})` : unlinkError,
		};
	}
}

/**
 * Append a session_info entry to a session JSONL file (host-side rename for non-active sessions).
 */
export async function renameSessionFile(sessionPath: string, name: string): Promise<RenameSessionFileResult> {
	const trimmed = name.trim();
	if (!trimmed) return { ok: false, error: "Session name cannot be empty" };
	if (!sessionPath || !existsSync(sessionPath)) return { ok: false, error: "Session file not found" };

	try {
		const text = await readFile(sessionPath, "utf8");
		const lines = text.split("\n").filter((line) => line.trim().length > 0);
		let parentId: string | null = null;
		const seenIds = new Set<string>();
		for (const line of lines) {
			try {
				const value = JSON.parse(line) as { id?: string };
				if (typeof value.id === "string") {
					seenIds.add(value.id);
					parentId = value.id;
				}
			} catch {
				// skip malformed
			}
		}

		let id = randomUUID().slice(0, 8);
		while (seenIds.has(id)) id = randomUUID().slice(0, 8);

		const entry = {
			type: "session_info",
			id,
			parentId,
			timestamp: new Date().toISOString(),
			name: trimmed,
		};
		await appendFile(sessionPath, `${JSON.stringify(entry)}\n`, "utf8");
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
