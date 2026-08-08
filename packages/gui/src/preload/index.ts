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
	bash: (command, excludeFromContext) => ipcRenderer.invoke(IPC_CHANNELS.bash, command, excludeFromContext),
	newSession: () => ipcRenderer.invoke(IPC_CHANNELS.newSession),
	switchSession: (sessionPath) => ipcRenderer.invoke(IPC_CHANNELS.switchSession, sessionPath),
	setSessionName: (name) => ipcRenderer.invoke(IPC_CHANNELS.setSessionName, name),
	getCommands: () => ipcRenderer.invoke(IPC_CHANNELS.getCommands),
	getModels: () => ipcRenderer.invoke(IPC_CHANNELS.getModels),
	setModel: (provider, modelId) => ipcRenderer.invoke(IPC_CHANNELS.setModel, provider, modelId),
	cycleModel: (direction) => ipcRenderer.invoke(IPC_CHANNELS.cycleModel, direction),
	cycleThinking: () => ipcRenderer.invoke(IPC_CHANNELS.cycleThinking),
	getSessionStats: () => ipcRenderer.invoke(IPC_CHANNELS.getSessionStats),
	refreshState: () => ipcRenderer.invoke(IPC_CHANNELS.refreshState),
	listSessions: (options) => ipcRenderer.invoke(IPC_CHANNELS.listSessions, options),
	searchFiles: (query, cwd) => ipcRenderer.invoke(IPC_CHANNELS.searchFiles, query, cwd),
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
