import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import type { ExtensionUiResponse, PromptRequest } from "../shared/ipc.ts";
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
	ipcMain.handle(IPC_CHANNELS.startEngine, async (_event, options?: { cwd?: string; sessionPath?: string }) => {
		if (!supervisor) throw new Error("No window");
		return await supervisor.start(options);
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
	ipcMain.handle(
		IPC_CHANNELS.bash,
		async (_event, command: string, excludeFromContext?: boolean, requestId?: string) => {
			if (!supervisor) return { ok: false, error: "No window" };
			return await supervisor.bash(command, excludeFromContext, requestId);
		},
	);
	ipcMain.handle(IPC_CHANNELS.newSession, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.newSession();
	});
	ipcMain.handle(IPC_CHANNELS.switchSession, async (_event, sessionPath: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.switchSession(sessionPath);
	});
	ipcMain.handle(IPC_CHANNELS.setSessionName, async (_event, name: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setSessionName(name);
	});
	ipcMain.handle(IPC_CHANNELS.cloneSession, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cloneSession();
	});
	ipcMain.handle(IPC_CHANNELS.exportHtml, async (_event, outputPath?: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.exportHtml(outputPath);
	});
	ipcMain.handle(IPC_CHANNELS.compact, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.compact();
	});
	ipcMain.handle(IPC_CHANNELS.getTree, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getTree();
	});
	ipcMain.handle(IPC_CHANNELS.navigateTree, async (_event, targetId: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.navigateTree(targetId);
	});
	ipcMain.handle(IPC_CHANNELS.getCommands, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getCommands();
	});
	ipcMain.handle(IPC_CHANNELS.getCommandCompletions, async (_event, commandName: string, argumentPrefix: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getCommandCompletions(commandName, argumentPrefix);
	});
	ipcMain.handle(IPC_CHANNELS.getEntries, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getEntries();
	});
	ipcMain.handle(IPC_CHANNELS.getShortcuts, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getShortcuts();
	});
	ipcMain.handle(IPC_CHANNELS.invokeShortcut, async (_event, key: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.invokeShortcut(key);
	});
	ipcMain.handle(IPC_CHANNELS.getModels, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getModels();
	});
	ipcMain.handle(IPC_CHANNELS.getAuthCatalog, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getAuthCatalog();
	});
	ipcMain.handle(IPC_CHANNELS.loginProvider, async (_event, provider: string, authType?: "api_key" | "oauth") => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.loginProvider(provider, authType);
	});
	ipcMain.handle(IPC_CHANNELS.logoutProvider, async (_event, provider: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.logoutProvider(provider);
	});
	ipcMain.handle(IPC_CHANNELS.cancelLoginProvider, async (_event, provider: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cancelLoginProvider(provider);
	});
	ipcMain.handle(IPC_CHANNELS.setModel, async (_event, provider: string, modelId: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setModel(provider, modelId);
	});
	ipcMain.handle(IPC_CHANNELS.cycleModel, async (_event, direction?: "forward" | "backward") => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cycleModel(direction);
	});
	ipcMain.handle(IPC_CHANNELS.cycleThinking, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cycleThinking();
	});
	ipcMain.handle(IPC_CHANNELS.getSessionStats, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getSessionStats();
	});
	ipcMain.handle(IPC_CHANNELS.refreshState, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.refreshState();
	});
	ipcMain.handle(IPC_CHANNELS.listSessions, async (_event, options?: { cwd?: string; all?: boolean }) => {
		if (!supervisor) return [];
		return await supervisor.listSessions(options);
	});
	ipcMain.handle(IPC_CHANNELS.renameSession, async (_event, sessionPath: string, name: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.renameSession(sessionPath, name);
	});
	ipcMain.handle(IPC_CHANNELS.deleteSession, async (_event, sessionPath: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.deleteSession(sessionPath);
	});
	ipcMain.handle(IPC_CHANNELS.searchFiles, async (_event, query: string, cwd?: string) => {
		if (!supervisor) return [];
		return await supervisor.searchFiles(query, cwd);
	});
	ipcMain.handle(IPC_CHANNELS.listThemes, () => supervisor?.listThemes() ?? []);
	ipcMain.handle(
		IPC_CHANNELS.getThemeCss,
		(_event, name?: string) => supervisor?.getThemeCss(name) ?? { name: "dark", cssVariables: {} },
	);
	ipcMain.handle(
		IPC_CHANNELS.getSettings,
		() => supervisor?.getSettings() ?? { theme: "dark", path: "", exists: false },
	);
	ipcMain.handle(IPC_CHANNELS.setTheme, (_event, name: string) => {
		if (!supervisor) throw new Error("No window");
		return supervisor.setTheme(name);
	});
	ipcMain.handle(IPC_CHANNELS.getTrustStatus, (_event, cwd?: string) => supervisor?.getTrustStatus(cwd));
	ipcMain.handle(IPC_CHANNELS.getTrustOptions, (_event, cwd?: string) => supervisor?.getTrustOptions(cwd) ?? []);
	ipcMain.handle(IPC_CHANNELS.applyTrust, (_event, optionId: string, cwd?: string) => {
		if (!supervisor) throw new Error("No window");
		return supervisor.applyTrust(optionId, cwd);
	});
	ipcMain.handle(IPC_CHANNELS.submitInputForm, (_event, componentId: string, values: Record<string, string>) => {
		supervisor?.submitInputForm(componentId, values);
	});
	ipcMain.handle(IPC_CHANNELS.cancelInputForm, (_event, componentId: string) => {
		supervisor?.cancelInputForm(componentId);
	});
	ipcMain.handle(IPC_CHANNELS.sendEngineCommand, (_event, command: { type: string; [key: string]: unknown }) => {
		supervisor?.sendEngineCommand(command);
	});
	ipcMain.handle(IPC_CHANNELS.respondExtensionUi, async (_event, response: ExtensionUiResponse) => {
		await supervisor?.respondExtensionUi(response);
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
