import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { FileMentionItem } from "../shared/ipc.ts";

const IGNORE = new Set([
	".git",
	"node_modules",
	"out",
	"dist",
	"release",
	".turbo",
	"coverage",
	"target",
	".next",
	".cache",
]);

const MAX_RESULTS = 40;
const MAX_WALK = 4_000;

/**
 * Lightweight gitignore-unaware fuzzy file search for `@` mentions.
 * Caps walk/results so a huge tree cannot stall the host.
 */
export async function searchFiles(cwd: string, query: string): Promise<FileMentionItem[]> {
	const needle = query.trim().toLowerCase();
	const matches: FileMentionItem[] = [];
	let walked = 0;

	const visit = async (dir: string): Promise<void> => {
		if (matches.length >= MAX_RESULTS || walked >= MAX_WALK) return;
		let entries: Dirent[] = [];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (matches.length >= MAX_RESULTS || walked >= MAX_WALK) return;
			if (IGNORE.has(entry.name) || entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			walked += 1;
			if (entry.isDirectory()) {
				await visit(full);
				continue;
			}
			if (!entry.isFile()) continue;
			const rel = relative(cwd, full).replaceAll("\\", "/");
			if (needle && !rel.toLowerCase().includes(needle)) continue;
			try {
				const info = await stat(full);
				if (!info.isFile()) continue;
			} catch {
				continue;
			}
			matches.push({ path: rel, label: rel });
		}
	};

	await visit(cwd);
	matches.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
	return matches.slice(0, MAX_RESULTS);
}
