import type { BrowserWindow } from "electron";
import type {
	EngineStatus,
	ExtensionUiRequest,
	ExtensionUiResponse,
	GuiRpcEvent,
	PromptRequest,
	RpcResult,
} from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";
import { EngineClient } from "./engine-client.ts";
import { searchFiles } from "./file-search.ts";
import { listSessions } from "./session-list.ts";

/**
 * Owns one interactive-engine child per window and fans status/events out over IPC.
 */
export class EngineSupervisor {
	private client: EngineClient | null = null;
	private readonly window: BrowserWindow;
	private cwd = process.cwd();

	constructor(window: BrowserWindow) {
		this.window = window;
	}

	getStatus(): EngineStatus {
		return this.client?.getStatus() ?? { state: "idle", cwd: this.cwd };
	}

	async start(options?: { cwd?: string; sessionPath?: string }): Promise<EngineStatus> {
		if (this.client) await this.stop();
		this.cwd = options?.cwd ?? process.cwd();
		this.client = new EngineClient({
			cwd: this.cwd,
			sessionPath: options?.sessionPath,
			onStatus: (status) => this.send(IPC_CHANNELS.status, status),
			onEvent: (event) => this.send(IPC_CHANNELS.event, event),
			onRawLine: (line) => this.send(IPC_CHANNELS.rawLine, line),
			onExtensionUi: (request) => this.send(IPC_CHANNELS.extensionUi, request),
		});
		return await this.client.start();
	}

	async stop(): Promise<void> {
		const client = this.client;
		this.client = null;
		await client?.stop();
		this.send(IPC_CHANNELS.status, { state: "stopped", cwd: this.cwd } satisfies EngineStatus);
	}

	async prompt(request: PromptRequest): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.prompt(request);
	}

	async abort(): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.abort();
	}

	async bash(command: string, excludeFromContext?: boolean): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.bash(command, excludeFromContext);
	}

	async newSession(): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.newSession();
	}

	async switchSession(sessionPath: string): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.switchSession(sessionPath);
	}

	async setSessionName(name: string): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.setSessionName(name);
	}

	async getCommands() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getCommands();
	}

	async getModels() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getModels();
	}

	async setModel(provider: string, modelId: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.setModel(provider, modelId);
	}

	async cycleModel(direction?: "forward" | "backward") {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.cycleModel(direction);
	}

	async cycleThinking() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.cycleThinking();
	}

	async getSessionStats() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getSessionStats();
	}

	async refreshState() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.refreshState();
	}

	async listSessions(options?: { cwd?: string; all?: boolean }) {
		return await listSessions({ cwd: options?.cwd ?? this.cwd, all: options?.all });
	}

	async searchFiles(query: string, cwd?: string) {
		return await searchFiles(cwd ?? this.cwd, query);
	}

	async respondExtensionUi(response: ExtensionUiResponse): Promise<void> {
		await this.client?.respondExtensionUi(response);
	}

	private send(channel: string, payload: EngineStatus | GuiRpcEvent | ExtensionUiRequest | string): void {
		if (this.window.isDestroyed()) return;
		this.window.webContents.send(channel, payload);
	}
}
