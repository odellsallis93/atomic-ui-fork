import type { BrowserWindow } from "electron";
import type {
	EngineStatus,
	ExtensionUiRequest,
	ExtensionUiResponse,
	GuiRpcEvent,
	PromptRequest,
	RpcResult,
	SettingsOperation,
	TrustOption,
	TrustStatus,
} from "../shared/ipc.ts";
import { IPC_CHANNELS } from "../shared/ipc.ts";
import { EngineClient } from "./engine-client.ts";
import { editExternally } from "./external-editor.ts";
import { searchFiles } from "./file-search.ts";
import { summarizeRawProtocolLine } from "./security.ts";
import { listSessions } from "./session-list.ts";

/**
 * Owns one interactive-engine child per window and fans status/events out over IPC.
 */
export class EngineSupervisor {
	private client: EngineClient | null = null;
	private readonly window: BrowserWindow;
	private cwd = process.cwd();
	private readonly sessionTrustOverrides = new Map<string, boolean>();

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
			extraArgs: this.sessionTrustOverrides.has(this.cwd)
				? [this.sessionTrustOverrides.get(this.cwd) ? "--approve" : "--no-approve"]
				: undefined,
			onStatus: (status) => this.send(IPC_CHANNELS.status, status),
			onEvent: (event) => this.send(IPC_CHANNELS.event, event),
			onRawLine: (line) => this.send(IPC_CHANNELS.rawLine, summarizeRawProtocolLine(line)),
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

	async bash(command: string, excludeFromContext?: boolean, requestId?: string): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.bash(command, excludeFromContext, requestId);
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

	async forkSession(entryId: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.forkSession(entryId);
	}

	async getForkMessages() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getForkMessages();
	}

	async importSession(inputPath: string, cwdOverride?: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.importSession(inputPath, cwdOverride);
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

	async shareSession() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.shareSession();
	}

	async navigateTree(
		targetId: string,
		options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
	) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.navigateTree(targetId, options);
	}

	async setTreeLabel(entryId: string, label?: string): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.setTreeLabel(entryId, label);
	}

	async getCommands() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getCommands();
	}

	async getCommandCompletions(commandName: string, argumentPrefix: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getCommandCompletions(commandName, argumentPrefix);
	}

	async getAutocomplete(text: string, cursorOffset: number) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getAutocomplete(text, cursorOffset);
	}

	async interceptTerminalInput(data: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.interceptTerminalInput(data);
	}

	async getEntries(options?: { offset?: number; limit?: number }) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getEntries(options);
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

	async setThinkingLevel(level: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.setThinkingLevel(level);
	}

	async getAvailableThinkingLevels() {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.getAvailableThinkingLevels();
	}

	async setSteeringMode(mode: "all" | "one-at-a-time") {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.setSteeringMode(mode);
	}

	async setFollowUpMode(mode: "all" | "one-at-a-time") {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.setFollowUpMode(mode);
	}

	async setAutoCompaction(enabled: boolean) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.setAutoCompaction(enabled);
	}

	async setAutoRetry(enabled: boolean) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		return await this.client.setAutoRetry(enabled);
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
		if (this.client?.getStatus().state === "ready") {
			const result = await this.client.listSessions(options);
			if (result.ok && result.data) return result.data;
		}
		return await listSessions({ cwd: options?.cwd ?? this.cwd, all: options?.all });
	}

	async renameSession(sessionPath: string, name: string): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.renameSession(sessionPath, name);
	}

	async deleteSession(sessionPath: string): Promise<RpcResult> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.deleteSession(sessionPath);
	}

	async searchFiles(query: string, cwd?: string) {
		return await searchFiles(cwd ?? this.cwd, query);
	}

	async listThemes() {
		if (!this.client) return [];
		const result = await this.client.listThemes();
		return result.ok && result.data ? result.data : [];
	}

	async getThemeCss(name?: string) {
		if (!this.client) return { name: "dark", cssVariables: {} };
		const result = await this.client.getThemeSnapshot(name);
		return result.ok && result.data ? result.data : { name: "dark", cssVariables: {} };
	}

	async getSettings() {
		if (!this.client)
			return {
				theme: "dark",
				projectOverridesTheme: false,
				fastMode: { chat: false, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "one-at-a-time" as const,
				followUpMode: "one-at-a-time" as const,
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: [],
			};
		const result = await this.client.getSettingsSnapshot();
		return result.ok && result.data
			? result.data
			: {
					theme: "dark",
					projectOverridesTheme: false,
					fastMode: { chat: false, workflow: false },
					hideThinkingBlock: false,
					steeringMode: "one-at-a-time" as const,
					followUpMode: "one-at-a-time" as const,
					autoCompactionEnabled: true,
					autoRetryEnabled: true,
					modelScopePatterns: [],
				};
	}

	async reloadSettings() {
		if (!this.client) throw new Error("Engine is not started");
		const result = await this.client.reloadSettings();
		if (!result.ok || !result.data) throw new Error(result.error ?? "Failed to reload settings");
		return result.data;
	}

	async setFastMode(scope: "chat" | "workflow", enabled: boolean) {
		if (!this.client) throw new Error("Engine is not started");
		const result = await this.client.setFastMode(scope, enabled);
		if (!result.ok || !result.data) throw new Error(result.error ?? "Failed to set fast mode");
		return result.data;
	}

	async updateSettings(operations: SettingsOperation[]) {
		if (!this.client) throw new Error("Engine is not started");
		const result = await this.client.updateSettings(operations);
		if (!result.ok || !result.data) throw new Error(result.error ?? "Failed to update settings");
		return result.data;
	}

	async setTheme(name: string) {
		if (!this.client) throw new Error("Engine is not started");
		const result = await this.client.setTheme(name);
		if (!result.ok || !result.data) throw new Error(result.error ?? "Failed to set theme");
		return result.data;
	}

	async getTrustStatus(): Promise<TrustStatus | undefined> {
		const result = await this.withTrustEngine((client) => client.getProjectTrust());
		if (!result.ok) throw new Error(result.error ?? "Failed to read project trust");
		if (!result.data) return undefined;
		const sessionTrustOverride = this.sessionTrustOverrides.get(this.cwd);
		return sessionTrustOverride === undefined
			? result.data
			: { ...result.data, decision: sessionTrustOverride, needsTrustPrompt: false };
	}

	async getTrustOptions(): Promise<TrustOption[]> {
		const result = await this.withTrustEngine((client) => client.getProjectTrustOptions());
		if (!result.ok) throw new Error(result.error ?? "Failed to list project-trust choices");
		return result.data ?? [];
	}

	async applyTrust(optionId: string): Promise<TrustStatus> {
		const result = await this.withTrustEngine((client) => client.setProjectTrust(optionId));
		if (!result.ok || !result.data) throw new Error(result.error ?? "Failed to apply project-trust choice");
		if (result.data.sessionOnly !== undefined) {
			this.sessionTrustOverrides.set(this.cwd, result.data.sessionOnly);
		} else {
			this.sessionTrustOverrides.delete(this.cwd);
		}
		return result.data.status;
	}

	private async withTrustEngine<T>(run: (client: EngineClient) => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
		if (this.client) return await run(this.client);
		// Probe under --no-approve: this engine owns trust-store access but cannot
		// load untrusted project resources while the GUI is asking the user.
		const probe = new EngineClient({ cwd: this.cwd, extraArgs: ["--no-approve", "--no-session"] });
		try {
			await probe.start();
			return await run(probe);
		} finally {
			await probe.stop().catch(() => undefined);
		}
	}

	submitInputForm(componentId: string, values: Record<string, string>): void {
		this.client?.sendEngineCommand({ type: "engine_input_form_submit", componentId, values });
	}

	cancelInputForm(componentId: string): void {
		this.client?.sendEngineCommand({ type: "engine_input_form_cancel", componentId });
	}

	async runEngineCommand<T = unknown>(command: { type: string; [key: string]: unknown }): Promise<RpcResult<T>> {
		if (!this.client) return { ok: false, error: "Engine is not started" };
		return await this.client.runEngineCommand<T>(command);
	}

	async editExternally(text: string) {
		if (!this.client) return { ok: false as const, error: "Engine is not started" };
		const command = await this.client.getExternalEditorCommand();
		if (!command.ok || !command.data)
			return { ok: false as const, error: command.error ?? "No external editor is configured" };
		return await editExternally(text, process.env, command.data);
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
