import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
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

function pathSearchRoot(
	cwd: string,
	query: string,
): { directory: string; prefix: string; displayBase: string } | undefined {
	if (!/^(?:~\/|\.\.?\/|\/)/.test(query)) return undefined;
	const expanded = query.startsWith("~/")
		? join(homedir(), query.slice(2))
		: query.startsWith("/")
			? query
			: resolve(cwd, query);
	const trailing = query.endsWith("/");
	const directory = trailing ? expanded : dirname(expanded);
	const prefix = trailing ? "" : expanded.slice(directory.length + (directory.endsWith(sep) ? 0 : 1)).toLowerCase();
	return { directory, prefix, displayBase: trailing ? query : query.slice(0, query.length - prefix.length) };
}

/** Lightweight path completion. Path syntax searches its named directory and keeps its prefix. */
export async function searchFiles(cwd: string, query: string): Promise<FileMentionItem[]> {
	const pathRoot = pathSearchRoot(cwd, query.trim());
	if (pathRoot) {
		try {
			const entries = await readdir(pathRoot.directory, { withFileTypes: true });
			return entries
				.filter(
					(entry) =>
						!IGNORE.has(entry.name) &&
						!entry.name.startsWith(".") &&
						entry.name.toLowerCase().startsWith(pathRoot.prefix),
				)
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, MAX_RESULTS)
				.map((entry) => ({
					path: `${pathRoot.displayBase}${entry.name}${entry.isDirectory() ? "/" : ""}`,
					label: `${pathRoot.displayBase}${entry.name}${entry.isDirectory() ? "/" : ""}`,
				}));
		} catch {
			return [];
		}
	}
	const needle = query.trim().toLowerCase();
	const matches: FileMentionItem[] = [];
	let walked = 0;
	const visit = async (dir: string): Promise<void> => {
		if (matches.length >= MAX_RESULTS || walked >= 4_000) return;
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (matches.length >= MAX_RESULTS || walked++ >= 4_000) return;
			if (IGNORE.has(entry.name) || entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			const rel = relative(cwd, full).replaceAll("\\", "/");
			if (!needle || rel.toLowerCase().includes(needle))
				matches.push({
					path: rel + (entry.isDirectory() ? "/" : ""),
					label: rel + (entry.isDirectory() ? "/" : ""),
				});
			if (entry.isDirectory()) await visit(full);
		}
	};
	await visit(cwd);
	return matches.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path)).slice(0, MAX_RESULTS);
}
