import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SessionListItem } from "../shared/ipc.ts";

function agentDir(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.ATOMIC_AGENT_DIR?.trim() || env.PI_AGENT_DIR?.trim();
	if (override) return resolve(override);
	return join(homedir(), ".atomic", "agent");
}

export function defaultSessionDirForCwd(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
	const resolvedCwd = resolve(cwd);
	const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(agentDir(env), "sessions", safePath);
}

function sessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
	return join(agentDir(env), "sessions");
}

async function summarizeSessionFile(path: string): Promise<SessionListItem | undefined> {
	try {
		const [text, fileStat] = await Promise.all([readFile(path, "utf8"), stat(path)]);
		const lines = text.split("\n").filter((line) => line.trim().length > 0);
		let id =
			path
				.split(/[/\\]/)
				.pop()
				?.replace(/\.jsonl$/, "") ?? path;
		let cwd = "";
		let name: string | undefined;
		let created = fileStat.birthtimeMs || fileStat.ctimeMs;
		let messageCount = 0;
		let firstMessage = "";
		let internal = false;

		for (const line of lines) {
			let value: unknown;
			try {
				value = JSON.parse(line);
			} catch {
				continue;
			}
			if (typeof value !== "object" || value === null || !("type" in value)) continue;
			const entry = value as {
				type: string;
				id?: string;
				cwd?: string;
				name?: string;
				timestamp?: string | number;
				internal?: boolean;
				message?: { role?: string; content?: unknown };
			};
			if (entry.type === "session" || entry.type === "session_info") {
				if (typeof entry.id === "string") id = entry.id;
				if (typeof entry.cwd === "string") cwd = entry.cwd;
				if (typeof entry.name === "string") name = entry.name;
				if (entry.internal === true) internal = true;
				if (typeof entry.timestamp === "string") created = Date.parse(entry.timestamp) || created;
				if (typeof entry.timestamp === "number") created = entry.timestamp;
			}
			if (entry.type === "message" && entry.message?.role === "user") {
				messageCount += 1;
				if (!firstMessage) {
					const content = entry.message.content;
					if (typeof content === "string") firstMessage = content;
					else if (Array.isArray(content)) {
						for (const block of content) {
							if (
								typeof block === "object" &&
								block !== null &&
								"type" in block &&
								(block as { type: string }).type === "text" &&
								"text" in block &&
								typeof (block as { text: unknown }).text === "string"
							) {
								firstMessage = (block as { text: string }).text;
								break;
							}
						}
					}
				}
			}
		}
		if (internal) return undefined;
		return {
			path,
			id,
			cwd,
			name,
			modified: fileStat.mtimeMs,
			created,
			messageCount,
			firstMessage: firstMessage || "(no messages)",
		};
	} catch {
		return undefined;
	}
}

async function listJsonlInDir(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return [];
	const entries = await readdir(dir);
	return entries.filter((name) => name.endsWith(".jsonl")).map((name) => join(dir, name));
}

/**
 * Host-side session enumeration (RPC has no list_sessions yet — plan §5.1).
 * Mirrors the TUI's SessionManager.list / listAll shape enough for a resume picker.
 */
export async function listSessions(options: {
	cwd?: string;
	all?: boolean;
	env?: NodeJS.ProcessEnv;
}): Promise<SessionListItem[]> {
	const env = options.env ?? process.env;
	const files: string[] = [];
	if (options.all) {
		const root = sessionsRoot(env);
		if (existsSync(root)) {
			const dirs = await readdir(root, { withFileTypes: true });
			for (const entry of dirs) {
				if (!entry.isDirectory()) continue;
				files.push(...(await listJsonlInDir(join(root, entry.name))));
			}
		}
	} else {
		const cwd = options.cwd ?? process.cwd();
		files.push(...(await listJsonlInDir(defaultSessionDirForCwd(cwd, env))));
	}

	const items: SessionListItem[] = [];
	for (const file of files) {
		const item = await summarizeSessionFile(file);
		if (item) items.push(item);
	}
	items.sort((a, b) => b.modified - a.modified);
	return items;
}
