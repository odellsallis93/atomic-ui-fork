import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import type { ExtensionUiResponse, PromptRequest } from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";
import { EngineSupervisor } from "./engine-supervisor.ts";
import { isAllowedAppNavigation, isSafeExternalUrl, isTrustedIpcSender } from "./security.ts";

const mainDir = dirname(fileURLToPath(import.meta.url));
const rendererIndex = join(mainDir, "../renderer/index.html");
const devRendererUrl = process.env.ELECTRON_RENDERER_URL;

const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"base-uri 'none'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'none'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"connect-src 'self'",
].join("; ");

function installContentSecurityPolicy(): void {
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		const responseHeaders = { ...details.responseHeaders };
		if (isAllowedAppNavigation(details.url, rendererIndex, devRendererUrl)) {
			responseHeaders["Content-Security-Policy"] = [CONTENT_SECURITY_POLICY];
		}
		callback({ responseHeaders });
	});
}

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
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (!isAllowedAppNavigation(url, rendererIndex, devRendererUrl)) event.preventDefault();
	});
	mainWindow.webContents.on("will-redirect", (event, url) => {
		if (!isAllowedAppNavigation(url, rendererIndex, devRendererUrl)) event.preventDefault();
	});
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (isSafeExternalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("ready-to-show", () => {
		mainWindow?.show();
	});
	mainWindow.on("closed", () => {
		void supervisor?.stop();
		supervisor = null;
		mainWindow = null;
	});

	if (devRendererUrl && isAllowedAppNavigation(devRendererUrl, rendererIndex, devRendererUrl)) {
		void mainWindow.loadURL(devRendererUrl);
	} else {
		void mainWindow.loadFile(rendererIndex);
	}
}

function registerIpcHandler(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
	ipcMain.handle(channel, (event, ...args) => {
		const senderFrame = event.senderFrame;
		if (
			!mainWindow ||
			mainWindow.isDestroyed() ||
			!senderFrame ||
			!isTrustedIpcSender(event.sender.id, mainWindow.webContents.id, senderFrame.url, rendererIndex, devRendererUrl)
		) {
			throw new Error("Rejected IPC sender");
		}
		return handler(event, ...args);
	});
}

function registerIpc(): void {
	registerIpcHandler(IPC_CHANNELS.getStatus, () => supervisor?.getStatus() ?? { state: "idle" });
	registerIpcHandler(IPC_CHANNELS.startEngine, async (_event, options?: { cwd?: string; sessionPath?: string }) => {
		if (!supervisor) throw new Error("No window");
		return await supervisor.start(options);
	});
	registerIpcHandler(IPC_CHANNELS.stopEngine, async () => {
		await supervisor?.stop();
	});
	registerIpcHandler(IPC_CHANNELS.prompt, async (_event, request: PromptRequest) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.prompt(request);
	});
	registerIpcHandler(IPC_CHANNELS.abort, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.abort();
	});
	registerIpcHandler(
		IPC_CHANNELS.bash,
		async (_event, command: string, excludeFromContext?: boolean, requestId?: string) => {
			if (!supervisor) return { ok: false, error: "No window" };
			return await supervisor.bash(command, excludeFromContext, requestId);
		},
	);
	registerIpcHandler(IPC_CHANNELS.newSession, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.newSession();
	});
	registerIpcHandler(IPC_CHANNELS.switchSession, async (_event, sessionPath: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.switchSession(sessionPath);
	});
	registerIpcHandler(IPC_CHANNELS.setSessionName, async (_event, name: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setSessionName(name);
	});
	registerIpcHandler(IPC_CHANNELS.cloneSession, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cloneSession();
	});
	registerIpcHandler(IPC_CHANNELS.forkSession, async (_event, entryId: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.forkSession(entryId);
	});
	registerIpcHandler(IPC_CHANNELS.getForkMessages, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getForkMessages();
	});
	registerIpcHandler(IPC_CHANNELS.importSession, async (_event, inputPath: string, cwdOverride?: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.importSession(inputPath, cwdOverride);
	});
	registerIpcHandler(IPC_CHANNELS.exportHtml, async (_event, outputPath?: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.exportHtml(outputPath);
	});
	registerIpcHandler(IPC_CHANNELS.shareSession, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.shareSession();
	});
	registerIpcHandler(IPC_CHANNELS.compact, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.compact();
	});
	registerIpcHandler(IPC_CHANNELS.getTree, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getTree();
	});
	registerIpcHandler(
		IPC_CHANNELS.navigateTree,
		async (
			_event,
			targetId: string,
			options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
		) => {
			if (!supervisor) return { ok: false, error: "No window" };
			return await supervisor.navigateTree(targetId, options);
		},
	);
	registerIpcHandler(IPC_CHANNELS.setTreeLabel, async (_event, entryId: string, label?: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setTreeLabel(entryId, label);
	});
	registerIpcHandler(IPC_CHANNELS.getCommands, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getCommands();
	});
	registerIpcHandler(
		IPC_CHANNELS.getCommandCompletions,
		async (_event, commandName: string, argumentPrefix: string) => {
			if (!supervisor) return { ok: false, error: "No window" };
			return await supervisor.getCommandCompletions(commandName, argumentPrefix);
		},
	);
	registerIpcHandler(IPC_CHANNELS.getEntries, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getEntries();
	});
	registerIpcHandler(IPC_CHANNELS.getShortcuts, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getShortcuts();
	});
	registerIpcHandler(IPC_CHANNELS.invokeShortcut, async (_event, key: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.invokeShortcut(key);
	});
	registerIpcHandler(IPC_CHANNELS.getModels, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getModels();
	});
	registerIpcHandler(IPC_CHANNELS.getAuthCatalog, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getAuthCatalog();
	});
	registerIpcHandler(IPC_CHANNELS.loginProvider, async (_event, provider: string, authType?: "api_key" | "oauth") => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.loginProvider(provider, authType);
	});
	registerIpcHandler(IPC_CHANNELS.logoutProvider, async (_event, provider: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.logoutProvider(provider);
	});
	registerIpcHandler(IPC_CHANNELS.cancelLoginProvider, async (_event, provider: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cancelLoginProvider(provider);
	});
	registerIpcHandler(IPC_CHANNELS.setModel, async (_event, provider: string, modelId: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setModel(provider, modelId);
	});
	registerIpcHandler(IPC_CHANNELS.cycleModel, async (_event, direction?: "forward" | "backward") => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cycleModel(direction);
	});
	registerIpcHandler(IPC_CHANNELS.cycleThinking, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.cycleThinking();
	});
	registerIpcHandler(IPC_CHANNELS.setThinkingLevel, async (_event, level: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setThinkingLevel(level);
	});
	registerIpcHandler(IPC_CHANNELS.getAvailableThinkingLevels, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getAvailableThinkingLevels();
	});
	registerIpcHandler(IPC_CHANNELS.setSteeringMode, async (_event, mode: "all" | "one-at-a-time") => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setSteeringMode(mode);
	});
	registerIpcHandler(IPC_CHANNELS.setFollowUpMode, async (_event, mode: "all" | "one-at-a-time") => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setFollowUpMode(mode);
	});
	registerIpcHandler(IPC_CHANNELS.setAutoCompaction, async (_event, enabled: boolean) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setAutoCompaction(enabled);
	});
	registerIpcHandler(IPC_CHANNELS.setAutoRetry, async (_event, enabled: boolean) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.setAutoRetry(enabled);
	});
	registerIpcHandler(IPC_CHANNELS.getSessionStats, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.getSessionStats();
	});
	registerIpcHandler(IPC_CHANNELS.refreshState, async () => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.refreshState();
	});
	registerIpcHandler(IPC_CHANNELS.listSessions, async (_event, options?: { cwd?: string; all?: boolean }) => {
		if (!supervisor) return [];
		return await supervisor.listSessions(options);
	});
	registerIpcHandler(IPC_CHANNELS.renameSession, async (_event, sessionPath: string, name: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.renameSession(sessionPath, name);
	});
	registerIpcHandler(IPC_CHANNELS.deleteSession, async (_event, sessionPath: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.deleteSession(sessionPath);
	});
	registerIpcHandler(IPC_CHANNELS.searchFiles, async (_event, query: string, cwd?: string) => {
		if (!supervisor) return [];
		return await supervisor.searchFiles(query, cwd);
	});
	registerIpcHandler(IPC_CHANNELS.listThemes, () => supervisor?.listThemes() ?? []);
	registerIpcHandler(
		IPC_CHANNELS.getThemeCss,
		(_event, name?: string) => supervisor?.getThemeCss(name) ?? { name: "dark", cssVariables: {} },
	);
	registerIpcHandler(
		IPC_CHANNELS.getSettings,
		() => supervisor?.getSettings() ?? { theme: "dark", path: "", exists: false },
	);
	registerIpcHandler(IPC_CHANNELS.setTheme, (_event, name: string) => {
		if (!supervisor) throw new Error("No window");
		return supervisor.setTheme(name);
	});
	registerIpcHandler(IPC_CHANNELS.getTrustStatus, (_event, cwd?: string) => supervisor?.getTrustStatus(cwd));
	registerIpcHandler(IPC_CHANNELS.getTrustOptions, (_event, cwd?: string) => supervisor?.getTrustOptions(cwd) ?? []);
	registerIpcHandler(IPC_CHANNELS.applyTrust, (_event, optionId: string, cwd?: string) => {
		if (!supervisor) throw new Error("No window");
		return supervisor.applyTrust(optionId, cwd);
	});
	registerIpcHandler(IPC_CHANNELS.submitInputForm, (_event, componentId: string, values: Record<string, string>) => {
		supervisor?.submitInputForm(componentId, values);
	});
	registerIpcHandler(IPC_CHANNELS.cancelInputForm, (_event, componentId: string) => {
		supervisor?.cancelInputForm(componentId);
	});
	registerIpcHandler(
		IPC_CHANNELS.runEngineCommand,
		async (_event, command: { type: string; [key: string]: unknown }) => {
			if (!supervisor) return { ok: false, error: "No window" };
			return await supervisor.runEngineCommand(command);
		},
	);
	registerIpcHandler(IPC_CHANNELS.editExternally, async (_event, text: string) => {
		if (!supervisor) return { ok: false, error: "No window" };
		return await supervisor.editExternally(text);
	});
	registerIpcHandler(IPC_CHANNELS.sendEngineCommand, (_event, command: { type: string; [key: string]: unknown }) => {
		supervisor?.sendEngineCommand(command);
	});
	registerIpcHandler(IPC_CHANNELS.respondExtensionUi, async (_event, response: ExtensionUiResponse) => {
		await supervisor?.respondExtensionUi(response);
	});
}

app.whenReady().then(() => {
	installContentSecurityPolicy();
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
