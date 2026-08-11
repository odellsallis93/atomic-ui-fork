import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";

const packageDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDir = join(packageDir, "release");

function platformOutputDir() {
	const expected = `${process.platform === "darwin" ? "mac" : process.platform}-${process.arch}`;
	const match = readdirSync(releaseDir, { withFileTypes: true }).find(
		(entry) => entry.isDirectory() && entry.name === expected,
	);
	if (!match) throw new Error(`No directory artifact at ${join(releaseDir, expected)}`);
	return join(releaseDir, match.name);
}

export function packagedExecutable(outputDir = platformOutputDir()) {
	if (process.platform === "darwin") {
		const appPath = join(outputDir, "Atomic.app");
		const executablePath = join(appPath, "Contents", "MacOS", "Atomic");
		if (existsSync(executablePath)) return { appPath, executablePath };
	}
	const names = process.platform === "win32" ? ["Atomic.exe"] : ["atomic", "Atomic"];
	for (const name of names) {
		const executablePath = join(outputDir, name);
		if (existsSync(executablePath) && statSync(executablePath).isFile()) {
			return { appPath: outputDir, executablePath };
		}
	}
	throw new Error(`No packaged Electron executable found under ${outputDir}`);
}

export async function runPackagedSmoke() {
	const { appPath, executablePath } = packagedExecutable();
	const userDataDir = mkdtempSync(join(releaseDir, ".smoke-user-data-"));
	let application;
	try {
		application = await _electron.launch({
			executablePath,
			args: [appPath, `--user-data-dir=${userDataDir}`, "--no-sandbox", "--disable-gpu"],
			env: {
				PATH: process.env.PATH ?? "",
				HOME: process.env.HOME ?? "",
				TMPDIR: process.env.TMPDIR ?? "",
				LANG: process.env.LANG ?? "C",
				NODE_ENV: "test",
			},
			timeout: 30_000,
		});
		const page = await application.firstWindow({ timeout: 30_000 });
		if ((await page.title()) !== "Atomic") throw new Error(`Unexpected packaged window title: ${await page.title()}`);
		if (!page.url().startsWith("file:")) throw new Error(`Unexpected packaged renderer URL: ${page.url()}`);
		if (!(await page.evaluate(() => typeof window.atomicGui?.getStatus === "function"))) {
			throw new Error("Packaged preload bridge did not start");
		}
		console.log(`packaged smoke passed: ${executablePath}`);
	} finally {
		await application?.close().catch(() => undefined);
		rmSync(userDataDir, { recursive: true, force: true });
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runPackagedSmoke();
