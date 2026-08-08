import { contextBridge, ipcRenderer } from "electron";
import type { EngineStatus, GuiHostApi, GuiRpcEvent, PromptRequest } from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";

const api: GuiHostApi = {
	getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
	startEngine: (options) => ipcRenderer.invoke(IPC_CHANNELS.startEngine, options),
	stopEngine: () => ipcRenderer.invoke(IPC_CHANNELS.stopEngine),
	prompt: (request: PromptRequest) => ipcRenderer.invoke(IPC_CHANNELS.prompt, request),
	abort: () => ipcRenderer.invoke(IPC_CHANNELS.abort),
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
};

contextBridge.exposeInMainWorld("atomicGui", api);
