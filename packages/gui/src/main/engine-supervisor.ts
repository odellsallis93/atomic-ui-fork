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
import { applyTrustDecision, getTrustOptions, getTrustStatus } from "./project-trust.ts";
import { listSessions } from "./session-list.ts";
import { deleteSessionFile, renameSessionFile } from "./session-ops.ts";
import { readGuiSettings, writeThemeSetting } from "./settings-store.ts";
import { listThemes, loadThemeCss } from "./theme-loader.ts";

/**
 * Owns one interactive-engine child per window and fans status/events out over IPC.
 */
export class EngineSupervisor {
	private client: EngineClient | null = null;
	private readonly window: BrowserWindow;
	private cwd = process.cwd();
	private sessionTrustOverride: boolean | undefined;

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

	async cloneSession(): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.cloneSession();
	}

	async exportHtml(outputPath?: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.exportHtml(outputPath);
	}

	async compact(): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.compact();
	}

	async getTree() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getTree();
	}

	async navigateTree(targetId: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.navigateTree(targetId);
	}

	async getCommands() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getCommands();
	}

	async getCommandCompletions(commandName: string, argumentPrefix: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getCommandCompletions(commandName, argumentPrefix);
	}

	async getEntries() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getEntries();
	}

	async getShortcuts() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getShortcuts();
	}

	async invokeShortcut(key: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.invokeShortcut(key);
	}

	async getModels() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getModels();
	}

	async getAuthCatalog() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getAuthCatalog();
	}

	async loginProvider(provider: string, authType?: "api_key" | "oauth") {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.loginProvider(provider, authType);
	}

	async logoutProvider(provider: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.logoutProvider(provider);
	}

	async cancelLoginProvider(provider: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.cancelLoginProvider(provider);
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

	async renameSession(sessionPath: string, name: string): Promise<RpcResult> {
		const current = this.client?.getStatus().sessionFile;
		if (current && current === sessionPath && this.client) {
			return await this.client.setSessionName(name);
		}
		const result = await renameSessionFile(sessionPath, name);
		return result.ok ? { ok: true } : { ok: false, error: result.error };
	}

	async deleteSession(sessionPath: string): Promise<RpcResult> {
		const current = this.client?.getStatus().sessionFile;
		if (current && current === sessionPath) {
			const switched = await this.client?.newSession();
			if (switched && !switched.ok) return switched;
		}
		const result = await deleteSessionFile(sessionPath);
		return result.ok ? { ok: true } : { ok: false, error: result.error };
	}

	async searchFiles(query: string, cwd?: string) {
		return await searchFiles(cwd ?? this.cwd, query);
	}

	listThemes() {
		return listThemes();
	}

	getThemeCss(name?: string) {
		const theme = name?.trim() || readGuiSettings().theme;
		return loadThemeCss(theme);
	}

	getSettings() {
		return readGuiSettings();
	}

	setTheme(name: string) {
		writeThemeSetting(name);
		return loadThemeCss(name);
	}

	getTrustStatus(cwd?: string) {
		const status = getTrustStatus(cwd ?? this.cwd);
		if (this.sessionTrustOverride !== undefined) {
			return {
				...status,
				decision: this.sessionTrustOverride,
				needsTrustPrompt: false,
			};
		}
		return status;
	}

	getTrustOptions(cwd?: string) {
		return getTrustOptions(cwd ?? this.cwd);
	}

	applyTrust(optionId: string, cwd?: string) {
		const option = getTrustOptions(cwd ?? this.cwd).find((item) => item.id === optionId);
		if (option && option.persistPath === null) {
			this.sessionTrustOverride = option.trusted;
			return this.getTrustStatus(cwd);
		}
		this.sessionTrustOverride = undefined;
		return applyTrustDecision(cwd ?? this.cwd, optionId);
	}

	submitInputForm(componentId: string, values: Record<string, string>): void {
		this.client?.sendEngineCommand({ type: "engine_input_form_submit", componentId, values });
	}

	cancelInputForm(componentId: string): void {
		this.client?.sendEngineCommand({ type: "engine_input_form_cancel", componentId });
	}

	sendEngineCommand(command: { type: string; [key: string]: unknown }): void {
		this.client?.sendEngineCommand(command);
	}

	async respondExtensionUi(response: ExtensionUiResponse): Promise<void> {
		await this.client?.respondExtensionUi(response);
	}

	private send(channel: string, payload: EngineStatus | GuiRpcEvent | ExtensionUiRequest | string): void {
		if (this.window.isDestroyed()) return;
		this.window.webContents.send(channel, payload);
	}
}
