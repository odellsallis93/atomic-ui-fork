import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import type { PromptRequest } from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";
import { EngineSupervisor } from "./engine-supervisor.ts";

const mainDir = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let supervisor: EngineSupervisor | null = null;

function resolvePreloadPath(): string {
	const candidates = [join(mainDir, "../preload/index.js"), join(mainDir, "../preload/index.mjs")];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return candidates[0]!;
}

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1100,
		height: 760,
		minWidth: 720,
		minHeight: 480,
		title: "Atomic",
		backgroundColor: "#1e1e2e",
		show: false,
		webPreferences: {
			preload: resolvePreloadPath(),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	supervisor = new EngineSupervisor(mainWindow);

	mainWindow.on("ready-to-show", () => {
		mainWindow?.show();
	});
	mainWindow.on("closed", () => {
		void supervisor?.stop();
		supervisor = null;
		mainWindow = null;
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void mainWindow.loadFile(join(mainDir, "../renderer/index.html"));
	}
}

function registerIpc(): void {
	ipcMain.handle(IPC_CHANNELS.getStatus, () => supervisor?.getStatus() ?? { state: "idle" });
	ipcMain.handle(IPC_CHANNELS.startEngine, async (_event, options?: { cwd?: string }) => {
		if (!supervisor) throw new Error("No window");
		return await supervisor.start(options?.cwd);
	});
	ipcMain.handle(IPC_CHANNELS.stopEngine, async () => {
		await supervisor?.stop();
	});
	ipcMain.handle(IPC_CHANNELS.prompt, async (_event, request: PromptRequest) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.prompt(request);
	});
	ipcMain.handle(IPC_CHANNELS.abort, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.abort();
	});
}

app.whenReady().then(() => {
	registerIpc();
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	void supervisor?.stop();
});
