import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";

const packageDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDir = join(packageDir, "release");
const GUI_ENVIRONMENT_KEYS = ["DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"];

function smokeEnvironment() {
	const env = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
		TMPDIR: process.env.TMPDIR ?? "",
		LANG: process.env.LANG ?? "C",
	};
	for (const key of GUI_ENVIRONMENT_KEYS) {
		const value = process.env[key];
		if (value !== undefined) env[key] = value;
	}
	return { ...env, NODE_ENV: "test" };
}

function hasPackagedExecutable(outputDir) {
	if (process.platform === "darwin") {
		return existsSync(join(outputDir, "Atomic.app", "Contents", "MacOS", "Atomic"));
	}
	const names = process.platform === "win32" ? ["Atomic.exe"] : ["atomic", "Atomic"];
	return names.some((name) => {
		const executablePath = join(outputDir, name);
		return existsSync(executablePath) && statSync(executablePath).isFile();
	});
}

function platformOutputDir() {
	const platform = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
	const names = [`${platform}-${process.arch}`, `${platform}-${process.arch}-unpacked`, `${platform}-unpacked`, platform];
	const directories = readdirSync(releaseDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	for (const name of [...names, ...directories.filter((entry) => entry.startsWith(`${platform}-`))]) {
		const outputDir = join(releaseDir, name);
		if (hasPackagedExecutable(outputDir)) return outputDir;
	}
	throw new Error(`No ${platform} directory artifact with an executable under ${releaseDir}`);
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
			args: [appPath, `--user-data-dir=${userDataDir}`, "--disable-gpu"],
			env: smokeEnvironment(),
			timeout: 30_000,
		});
		const page = await application.firstWindow({ timeout: 30_000 });
		if ((await page.title()) !== "Atomic") throw new Error(`Unexpected packaged window title: ${await page.title()}`);
		if (!page.url().startsWith("file:")) throw new Error(`Unexpected packaged renderer URL: ${page.url()}`);
		const bridgeReady = await page.evaluate(async () => {
			if (typeof window.atomicGui?.getStatus !== "function") return false;
			const status = await window.atomicGui.getStatus();
			return typeof status?.state === "string";
		});
		if (!bridgeReady) throw new Error("Packaged preload bridge did not answer IPC");
		console.log(`packaged smoke passed: ${executablePath}`);
	} finally {
		await application?.close().catch(() => undefined);
		rmSync(userDataDir, { recursive: true, force: true });
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runPackagedSmoke();
