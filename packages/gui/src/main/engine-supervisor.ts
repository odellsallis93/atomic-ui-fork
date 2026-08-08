import type { BrowserWindow } from "electron";
import type { EngineStatus, GuiRpcEvent, PromptRequest, PromptResult } from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";
import { EngineClient } from "./engine-client.ts";

/**
 * Owns one interactive-engine child per window and fans status/events out over IPC.
 */
export class EngineSupervisor {
	private client: EngineClient | null = null;
	private readonly window: BrowserWindow;

	constructor(window: BrowserWindow) {
		this.window = window;
	}

	getStatus(): EngineStatus {
		return this.client?.getStatus() ?? { state: "idle" };
	}

	async start(cwd?: string): Promise<EngineStatus> {
		if (this.client) await this.stop();
		this.client = new EngineClient({
			cwd: cwd ?? process.cwd(),
			onStatus: (status) => this.send(IPC_CHANNELS.status, status),
			onEvent: (event) => this.send(IPC_CHANNELS.event, event),
			onRawLine: (line) => this.send(IPC_CHANNELS.rawLine, line),
		});
		return await this.client.start();
	}

	async stop(): Promise<void> {
		const client = this.client;
		this.client = null;
		await client?.stop();
		this.send(IPC_CHANNELS.status, { state: "stopped" } satisfies EngineStatus);
	}

	async prompt(request: PromptRequest): Promise<PromptResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.prompt(request);
	}

	async abort(): Promise<PromptResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.abort();
	}

	private send(channel: string, payload: EngineStatus | GuiRpcEvent | string): void {
		if (this.window.isDestroyed()) return;
		this.window.webContents.send(channel, payload);
	}
}
