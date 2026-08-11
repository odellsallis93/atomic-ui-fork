import { contextBridge, ipcRenderer } from "electron";
import type {
	EngineStatus,
	ExtensionUiRequest,
	ExtensionUiResponse,
	GuiHostApi,
	GuiRpcEvent,
	PromptRequest,
} from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";

const api: GuiHostApi = {
	getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
	startEngine: (options) => ipcRenderer.invoke(IPC_CHANNELS.startEngine, options),
	stopEngine: () => ipcRenderer.invoke(IPC_CHANNELS.stopEngine),
	prompt: (request: PromptRequest) => ipcRenderer.invoke(IPC_CHANNELS.prompt, request),
	abort: () => ipcRenderer.invoke(IPC_CHANNELS.abort),
	bash: (command, excludeFromContext, requestId) =>
		ipcRenderer.invoke(IPC_CHANNELS.bash, command, excludeFromContext, requestId),
	newSession: () => ipcRenderer.invoke(IPC_CHANNELS.newSession),
	switchSession: (sessionPath) => ipcRenderer.invoke(IPC_CHANNELS.switchSession, sessionPath),
	setSessionName: (name) => ipcRenderer.invoke(IPC_CHANNELS.setSessionName, name),
	cloneSession: () => ipcRenderer.invoke(IPC_CHANNELS.cloneSession),
	forkSession: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.forkSession, entryId),
	getForkMessages: () => ipcRenderer.invoke(IPC_CHANNELS.getForkMessages),
	importSession: (inputPath, cwdOverride) => ipcRenderer.invoke(IPC_CHANNELS.importSession, inputPath, cwdOverride),
	exportHtml: (outputPath) => ipcRenderer.invoke(IPC_CHANNELS.exportHtml, outputPath),
	compact: () => ipcRenderer.invoke(IPC_CHANNELS.compact),
	getTree: () => ipcRenderer.invoke(IPC_CHANNELS.getTree),
	navigateTree: (targetId, options) => ipcRenderer.invoke(IPC_CHANNELS.navigateTree, targetId, options),
	setTreeLabel: (entryId, label) => ipcRenderer.invoke(IPC_CHANNELS.setTreeLabel, entryId, label),
	getCommands: () => ipcRenderer.invoke(IPC_CHANNELS.getCommands),
	getCommandCompletions: (commandName, argumentPrefix) =>
		ipcRenderer.invoke(IPC_CHANNELS.getCommandCompletions, commandName, argumentPrefix),
	getEntries: () => ipcRenderer.invoke(IPC_CHANNELS.getEntries),
	getShortcuts: () => ipcRenderer.invoke(IPC_CHANNELS.getShortcuts),
	invokeShortcut: (key) => ipcRenderer.invoke(IPC_CHANNELS.invokeShortcut, key),
	getModels: () => ipcRenderer.invoke(IPC_CHANNELS.getModels),
	getAuthCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.getAuthCatalog),
	loginProvider: (provider, authType) => ipcRenderer.invoke(IPC_CHANNELS.loginProvider, provider, authType),
	logoutProvider: (provider) => ipcRenderer.invoke(IPC_CHANNELS.logoutProvider, provider),
	cancelLoginProvider: (provider) => ipcRenderer.invoke(IPC_CHANNELS.cancelLoginProvider, provider),
	setModel: (provider, modelId) => ipcRenderer.invoke(IPC_CHANNELS.setModel, provider, modelId),
	cycleModel: (direction) => ipcRenderer.invoke(IPC_CHANNELS.cycleModel, direction),
	cycleThinking: () => ipcRenderer.invoke(IPC_CHANNELS.cycleThinking),
	setThinkingLevel: (level) => ipcRenderer.invoke(IPC_CHANNELS.setThinkingLevel, level),
	getAvailableThinkingLevels: () => ipcRenderer.invoke(IPC_CHANNELS.getAvailableThinkingLevels),
	setSteeringMode: (mode) => ipcRenderer.invoke(IPC_CHANNELS.setSteeringMode, mode),
	setFollowUpMode: (mode) => ipcRenderer.invoke(IPC_CHANNELS.setFollowUpMode, mode),
	setAutoCompaction: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setAutoCompaction, enabled),
	setAutoRetry: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setAutoRetry, enabled),
	getSessionStats: () => ipcRenderer.invoke(IPC_CHANNELS.getSessionStats),
	refreshState: () => ipcRenderer.invoke(IPC_CHANNELS.refreshState),
	listSessions: (options) => ipcRenderer.invoke(IPC_CHANNELS.listSessions, options),
	renameSession: (sessionPath, name) => ipcRenderer.invoke(IPC_CHANNELS.renameSession, sessionPath, name),
	deleteSession: (sessionPath) => ipcRenderer.invoke(IPC_CHANNELS.deleteSession, sessionPath),
	searchFiles: (query, cwd) => ipcRenderer.invoke(IPC_CHANNELS.searchFiles, query, cwd),
	listThemes: () => ipcRenderer.invoke(IPC_CHANNELS.listThemes),
	getThemeCss: (name) => ipcRenderer.invoke(IPC_CHANNELS.getThemeCss, name),
	getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
	setTheme: (name) => ipcRenderer.invoke(IPC_CHANNELS.setTheme, name),
	getTrustStatus: (cwd) => ipcRenderer.invoke(IPC_CHANNELS.getTrustStatus, cwd),
	getTrustOptions: (cwd) => ipcRenderer.invoke(IPC_CHANNELS.getTrustOptions, cwd),
	applyTrust: (optionId, cwd) => ipcRenderer.invoke(IPC_CHANNELS.applyTrust, optionId, cwd),
	submitInputForm: (componentId, values) => ipcRenderer.invoke(IPC_CHANNELS.submitInputForm, componentId, values),
	cancelInputForm: (componentId) => ipcRenderer.invoke(IPC_CHANNELS.cancelInputForm, componentId),
	runEngineCommand: (command) => ipcRenderer.invoke(IPC_CHANNELS.runEngineCommand, command),
	editExternally: (text) => ipcRenderer.invoke(IPC_CHANNELS.editExternally, text),
	sendEngineCommand: (command) => ipcRenderer.invoke(IPC_CHANNELS.sendEngineCommand, command),
	respondExtensionUi: (response: ExtensionUiResponse) => ipcRenderer.invoke(IPC_CHANNELS.respondExtensionUi, response),
	onStatus: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, status: EngineStatus): void => {
			listener(status);
		};
		ipcRenderer.on(IPC_CHANNELS.status, handler);
		return () => {
			ipcRenderer.off(IPC_CHANNELS.status, handler);
		};
	},
	onEvent: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, event: GuiRpcEvent): void => {
			listener(event);
		};
		ipcRenderer.on(IPC_CHANNELS.event, handler);
		return () => {
			ipcRenderer.off(IPC_CHANNELS.event, handler);
		};
	},
	onRawLine: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, line: string): void => {
			listener(line);
		};
		ipcRenderer.on(IPC_CHANNELS.rawLine, handler);
		return () => {
			ipcRenderer.off(IPC_CHANNELS.rawLine, handler);
		};
	},
	onExtensionUi: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, request: ExtensionUiRequest): void => {
			listener(request);
		};
		ipcRenderer.on(IPC_CHANNELS.extensionUi, handler);
		return () => {
			ipcRenderer.off(IPC_CHANNELS.extensionUi, handler);
		};
	},
};

contextBridge.exposeInMainWorld("atomicGui", api);
