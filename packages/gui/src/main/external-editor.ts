import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function parseCommand(command: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	for (const character of command) {
		if (character === "'" || character === '"') {
			quote = quote === character ? undefined : (quote ?? character);
		} else if (/\s/.test(character) && !quote) {
			if (current) args.push(current);
			current = "";
		} else current += character;
	}
	if (current) args.push(current);
	return args;
}

export async function editExternally(
	text: string,
	environment = process.env,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	const command = environment.VISUAL || environment.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
	const [editor, ...args] = parseCommand(command);
	if (!editor) return { ok: false, error: "No external editor is configured" };
	const directory = mkdtempSync(join(tmpdir(), "atomic-gui-editor-"));
	const path = join(directory, "prompt.md");
	try {
		writeFileSync(path, text, { encoding: "utf8", mode: 0o600 });
		const exitCode = await new Promise<number | null>((resolve) => {
			const child = spawn(editor, [...args, path], { stdio: "inherit", shell: process.platform === "win32" });
			child.once("error", () => resolve(null));
			child.once("close", (code) => resolve(code));
		});
		if (exitCode !== 0) return { ok: false, error: `External editor exited with ${exitCode ?? "an error"}` };
		return { ok: true, text: readFileSync(path, "utf8").replace(/\n$/, "") };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
