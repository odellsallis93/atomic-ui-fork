import { type ChildProcess, spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	AuthCatalog,
	CommandCompletionInfo,
	EngineAutocompleteSuggestion,
	EngineStatus,
	ExtensionShortcutInfo,
	ExtensionUiRequest,
	ExtensionUiResponse,
	ForkMessageInfo,
	GuiBashResult,
	GuiRpcEvent,
	GuiSettingsSnapshot,
	ModelInfo,
	OAuthProviderInfo,
	PromptRequest,
	ResolvedThemeCss,
	RpcResult,
	SessionListItem,
	SessionShareResult,
	SessionStatsSummary,
	SessionTreeNodeInfo,
	SettingsOperation,
	SlashCommandInfo,
	TerminalInputInterception,
	ThemeSummary,
	TreeNavigationOptions,
	TrustOption,
	TrustStatus,
} from "../shared/ipc.ts";
import {
	INTERACTIVE_ENGINE_BOOTSTRAP_FLAG,
	type InteractiveEngineBootstrapHandle,
	removeOwnedInteractiveEngineBootstrap,
	writeInteractiveEngineBootstrap,
} from "./engine-bootstrap.ts";
import {
	attachJsonlLineReader,
	INTERACTIVE_ENGINE_PROTOCOL_VERSION,
	isEngineMessage,
	isExtensionUiRequest,
	isRpcEvent,
	isRpcResponse,
	parseEngineReady,
	serializeJsonLine,
} from "./jsonl.ts";
import { type ResolvedAtomicCli, resolveAtomicCli } from "./resolve-atomic.ts";

export interface EngineClientOptions {
	cwd?: string;
	sessionPath?: string;
	cli?: ResolvedAtomicCli;
	extraArgs?: string[];
	/** Optional child-process environment additions (primarily for isolated host tests). */
	env?: NodeJS.ProcessEnv;
	onStatus?: (status: EngineStatus) => void;
	onEvent?: (event: GuiRpcEvent) => void;
	onRawLine?: (line: string) => void;
	onExtensionUi?: (request: ExtensionUiRequest) => void;
}

/** A durable transcript page can take longer than ordinary interactive RPCs to cross Electron IPC. */
const TRANSCRIPT_READ_TIMEOUT_MS = 120_000;

/**
 * Host-side JSONL client for an isolated interactive-engine child.
 * Speaks protocol v3 (engine_ready handshake) plus the RPC command set.
 */
export class EngineClient {
	private child: ChildProcess | null = null;
	private stopReading: (() => void) | null = null;
	private bootstrap: InteractiveEngineBootstrapHandle | undefined;
	private guardianFile: string | undefined;
	private status: EngineStatus = { state: "idle" };
	private requestId = 0;
	private readonly pending = new Map<
		string,
		{ resolve: (value: RpcResult) => void; reject: (error: Error) => void; accepted: boolean }
	>();
	private readonly options: EngineClientOptions;

	constructor(options: EngineClientOptions = {}) {
		this.options = options;
	}

	getStatus(): EngineStatus {
		return { ...this.status };
	}

	async start(): Promise<EngineStatus> {
		if (this.child) throw new Error("Engine already started");

		this.setStatus({ state: "starting", cwd: this.options.cwd ?? process.cwd() });
		const cli = this.options.cli ?? resolveAtomicCli();
		this.guardianFile = join(tmpdir(), `atomic-gui-engine-guardian-${process.pid}-${crypto.randomUUID()}`);
		this.bootstrap = writeInteractiveEngineBootstrap({
			hostPid: process.pid,
			guardFile: this.guardianFile,
			hostKind: "gui",
		});

		// A GUI window owns normal durable Atomic sessions by default. `--no-session`
		// makes import/list/new/resume impossible and is appropriate only for an
		// explicit ephemeral host (which this launcher is not). Keep the optional
		// explicit resume path while letting the engine create its standard session.
		const sessionArgs = this.options.sessionPath ? ["--session", this.options.sessionPath] : [];
		const cliArgs = [
			"--mode",
			"rpc",
			...sessionArgs,
			...(this.options.extraArgs ?? []),
			INTERACTIVE_ENGINE_BOOTSTRAP_FLAG,
			this.bootstrap.path,
		];
		const argv = [...cli.runtimeArgs, ...(cli.cliPath ? [cli.cliPath] : []), ...cliArgs];

		try {
			this.child = spawn(cli.runtimeExecutable, argv, {
				cwd: this.options.cwd ?? process.cwd(),
				env: { ...process.env, ...this.options.env },
				stdio: ["pipe", "pipe", "pipe"],
				detached: process.platform !== "win32",
			});
		} catch (error) {
			this.cleanupBootstrap();
			const message = error instanceof Error ? error.message : String(error);
			this.setStatus({ state: "error", error: message, cliPath: cli.cliPath || cli.runtimeExecutable });
			throw error;
		}

		const child = this.child;
		let failReady: ((error: Error) => void) | undefined;
		child.stderr?.on("data", (chunk: Buffer) => {
			process.stderr.write(chunk);
		});
		child.once("exit", (code, signal) => {
			const error = new Error(`Engine exited (code=${code}, signal=${signal})`);
			failReady?.(error);
			failReady = undefined;
			for (const [, pending] of this.pending) {
				pending.reject(error);
			}
			this.pending.clear();
			this.cleanupBootstrap();
			this.child = null;
			this.stopReading?.();
			this.stopReading = null;
			if (this.status.state !== "stopped") {
				this.setStatus({
					state: "error",
					error: error.message,
					cliPath: cli.cliPath || cli.runtimeExecutable,
				});
			}
		});

		const ready = new Promise<EngineStatus>((resolve, reject) => {
			const timeout = setTimeout(() => {
				failReady = undefined;
				reject(new Error("Timed out waiting for engine_ready"));
			}, 60_000);
			failReady = (error) => {
				clearTimeout(timeout);
				reject(error);
			};
			this.stopReading = attachJsonlLineReader(child.stdout!, (line) => {
				this.options.onRawLine?.(line);
				const readyMsg = parseEngineReady(line);
				if (readyMsg) {
					if (readyMsg.protocolVersion !== INTERACTIVE_ENGINE_PROTOCOL_VERSION) {
						clearTimeout(timeout);
						failReady = undefined;
						reject(
							new Error(
								`Engine protocol ${readyMsg.protocolVersion} incompatible with host ${INTERACTIVE_ENGINE_PROTOCOL_VERSION}`,
							),
						);
						return;
					}
					const next: EngineStatus = {
						state: "ready",
						pid: readyMsg.pid,
						protocolVersion: readyMsg.protocolVersion,
						hostKind: readyMsg.hostInfo?.kind,
						cliPath: cli.cliPath || cli.runtimeExecutable,
						cwd: this.options.cwd ?? process.cwd(),
						sessionFile: this.options.sessionPath,
					};
					this.setStatus(next);
					clearTimeout(timeout);
					failReady = undefined;
					resolve(next);
					return;
				}
				this.handleLine(line);
			});
			child.once("error", (error) => failReady?.(error));
		});

		try {
			await ready;
			await this.refreshState().catch(() => undefined);
			const current = this.getStatus();
			if (current.state === "ready") return current;
			throw new Error(current.error ?? "Engine stopped before startup completed");
		} catch (error) {
			await this.stop();
			const message = error instanceof Error ? error.message : String(error);
			this.setStatus({ state: "error", error: message, cliPath: cli.cliPath || cli.runtimeExecutable });
			throw error;
		}
	}

	async stop(): Promise<void> {
		this.setStatus({ ...this.status, state: "stopped" });
		const child = this.child;
		const guardianFile = this.guardianFile;
		this.child = null;
		this.stopReading?.();
		this.stopReading = null;
		for (const [, pending] of this.pending) {
			pending.reject(new Error("Engine stopped"));
		}
		this.pending.clear();
		if (child && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
			if (await waitForChildExit(child, 250)) {
				this.cleanupBootstrap();
				return;
			}
			if (guardianFile) {
				writeFileSync(guardianFile, "stop", { mode: 0o600 });
				if (await waitForChildExit(child, 500)) {
					this.cleanupBootstrap();
					return;
				}
			}
			killEngineProcessTree(child);
		}
		this.cleanupBootstrap();
	}

	async prompt(request: PromptRequest): Promise<RpcResult> {
		return await this.command({
			type: "prompt",
			message: request.message,
			...(request.streamingBehavior ? { streamingBehavior: request.streamingBehavior } : {}),
			...(request.images ? { images: request.images } : {}),
		});
	}

	async abort(): Promise<RpcResult> {
		return await this.command({ type: "abort" });
	}

	async bash(
		command: string,
		excludeFromContext = false,
		requestId = `gui-${++this.requestId}`,
	): Promise<RpcResult<GuiBashResult>> {
		if (!this.child?.stdin || this.status.state !== "ready") return { ok: false, error: "Engine is not ready" };
		const result = await this.request({ type: "bash", command, excludeFromContext, id: requestId });
		const data =
			typeof result.data === "object" && result.data !== null
				? (result.data as Omit<GuiBashResult, "requestId">)
				: {};
		return { ...result, data: { ...data, requestId } };
	}

	async newSession(): Promise<RpcResult> {
		const result = await this.command({ type: "new_session", persist: true });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async switchSession(sessionPath: string): Promise<RpcResult> {
		const result = await this.command({ type: "switch_session", sessionPath });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async setSessionName(name: string): Promise<RpcResult> {
		const result = await this.command({ type: "set_session_name", name });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async cloneSession(): Promise<RpcResult> {
		const result = await this.command({ type: "clone" });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async forkSession(entryId: string): Promise<RpcResult<{ text?: string; cancelled: boolean }>> {
		return await this.command({ type: "fork", entryId });
	}

	async getForkMessages(): Promise<RpcResult<ForkMessageInfo[]>> {
		const result = await this.command<{ messages?: ForkMessageInfo[] }>({ type: "get_fork_messages" });
		if (!result.ok) return { ok: false, error: result.error };
		return { ok: true, data: Array.isArray(result.data?.messages) ? result.data.messages : [] };
	}

	async importSession(inputPath: string, cwdOverride?: string): Promise<RpcResult<{ cancelled: boolean }>> {
		const result = await this.command<{ cancelled?: boolean }>(
			{
				type: "import_session",
				inputPath,
				...(cwdOverride ? { cwdOverride } : {}),
			},
			120_000,
		);
		if (!result.ok) return { ok: false, error: result.error };
		await this.refreshState().catch(() => undefined);
		return { ok: true, data: { cancelled: result.data?.cancelled === true } };
	}

	async exportHtml(outputPath?: string): Promise<RpcResult<{ path: string }>> {
		return await this.command<{ path: string }>({
			type: "export_html",
			...(outputPath ? { outputPath } : {}),
		});
	}

	async shareSession(): Promise<RpcResult<SessionShareResult>> {
		const result = await this.command<{ gistUrl?: unknown; shareUrl?: unknown }>({ type: "share_session" }, 120_000);
		if (!result.ok) return { ok: false, error: result.error };
		if (typeof result.data?.gistUrl !== "string" || typeof result.data.shareUrl !== "string") {
			return { ok: false, error: "Engine returned an invalid share response" };
		}
		return { ok: true, data: { gistUrl: result.data.gistUrl, shareUrl: result.data.shareUrl } };
	}

	async deleteSession(sessionPath: string): Promise<RpcResult> {
		const result = await this.command({ type: "delete_session", sessionPath, persistReplacement: true });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async renameSession(sessionPath: string, name: string): Promise<RpcResult> {
		return await this.command({ type: "rename_session", sessionPath, name });
	}

	async getSettingsSnapshot(): Promise<RpcResult<GuiSettingsSnapshot>> {
		const result = await this.command<Partial<GuiSettingsSnapshot>>({ type: "get_settings_snapshot" });
		if (!result.ok) return { ok: false, error: result.error };
		return this.parseSettingsSnapshot(result.data);
	}

	async reloadSettings(): Promise<RpcResult<GuiSettingsSnapshot>> {
		const result = await this.command<Partial<GuiSettingsSnapshot>>({ type: "reload_settings" });
		if (!result.ok) return { ok: false, error: result.error };
		return this.parseSettingsSnapshot(result.data);
	}

	async setFastMode(scope: "chat" | "workflow", enabled: boolean): Promise<RpcResult<GuiSettingsSnapshot>> {
		const result = await this.command<Partial<GuiSettingsSnapshot>>({ type: "set_fast_mode", scope, enabled });
		if (!result.ok) return { ok: false, error: result.error };
		return this.parseSettingsSnapshot(result.data);
	}

	private parseSettingsSnapshot(data: Partial<GuiSettingsSnapshot> | undefined): RpcResult<GuiSettingsSnapshot> {
		if (
			typeof data?.theme !== "string" ||
			typeof data.projectOverridesTheme !== "boolean" ||
			typeof data.fastMode?.chat !== "boolean" ||
			typeof data.fastMode.workflow !== "boolean" ||
			typeof data.hideThinkingBlock !== "boolean" ||
			(data.steeringMode !== "all" && data.steeringMode !== "one-at-a-time") ||
			(data.followUpMode !== "all" && data.followUpMode !== "one-at-a-time") ||
			typeof data.autoCompactionEnabled !== "boolean" ||
			typeof data.autoRetryEnabled !== "boolean" ||
			!Array.isArray(data.modelScopePatterns) ||
			!data.modelScopePatterns.every((pattern) => typeof pattern === "string")
		) {
			return { ok: false, error: "Engine returned an invalid settings snapshot" };
		}
		return { ok: true, data: data as GuiSettingsSnapshot };
	}

	async updateSettings(operations: SettingsOperation[]): Promise<RpcResult<GuiSettingsSnapshot>> {
		const result = await this.command<Partial<GuiSettingsSnapshot>>({ type: "update_settings", operations });
		if (!result.ok) return { ok: false, error: result.error };
		return this.parseSettingsSnapshot(result.data);
	}

	async getExternalEditorCommand(): Promise<RpcResult<string>> {
		const result = await this.command<{ command?: unknown }>({ type: "get_external_editor_command" });
		if (!result.ok) return { ok: false, error: result.error };
		if (typeof result.data?.command !== "string" || result.data.command.trim() === "") {
			return { ok: false, error: "Engine returned an invalid external-editor command" };
		}
		return { ok: true, data: result.data.command };
	}

	async getProjectTrust(): Promise<RpcResult<TrustStatus>> {
		const result = await this.command<Partial<TrustStatus>>({ type: "get_project_trust" });
		if (!result.ok) return { ok: false, error: result.error };
		if (
			typeof result.data?.cwd !== "string" ||
			typeof result.data.needsTrustPrompt !== "boolean" ||
			typeof result.data.hasProjectResources !== "boolean" ||
			(result.data.decision !== true && result.data.decision !== false && result.data.decision !== null)
		) {
			return { ok: false, error: "Engine returned an invalid project-trust status" };
		}
		return { ok: true, data: result.data as TrustStatus };
	}

	async getProjectTrustOptions(): Promise<RpcResult<TrustOption[]>> {
		const result = await this.command<{ options?: unknown }>({ type: "get_project_trust_options" });
		if (!result.ok) return { ok: false, error: result.error };
		const options = Array.isArray(result.data?.options)
			? result.data.options.filter(
					(option): option is TrustOption =>
						typeof option === "object" &&
						option !== null &&
						typeof (option as { id?: unknown }).id === "string" &&
						typeof (option as { label?: unknown }).label === "string" &&
						typeof (option as { trusted?: unknown }).trusted === "boolean" &&
						typeof (option as { sessionOnly?: unknown }).sessionOnly === "boolean",
				)
			: [];
		return { ok: true, data: options };
	}

	async setProjectTrust(optionId: string): Promise<RpcResult<{ status: TrustStatus; sessionOnly?: boolean }>> {
		const result = await this.command<{ status?: TrustStatus; sessionOnly?: unknown }>({
			type: "set_project_trust",
			optionId,
		});
		if (!result.ok) return { ok: false, error: result.error };
		const data = result.data;
		const status = data?.status;
		if (
			typeof status?.cwd !== "string" ||
			typeof status.needsTrustPrompt !== "boolean" ||
			typeof status.hasProjectResources !== "boolean" ||
			(status.decision !== true && status.decision !== false && status.decision !== null) ||
			(data?.sessionOnly !== undefined && typeof data.sessionOnly !== "boolean")
		) {
			return { ok: false, error: "Engine returned an invalid project-trust decision" };
		}
		return {
			ok: true,
			data: {
				status,
				...(typeof data?.sessionOnly === "boolean" ? { sessionOnly: data.sessionOnly } : {}),
			},
		};
	}

	async listThemes(): Promise<RpcResult<ThemeSummary[]>> {
		const result = await this.command<{ themes?: unknown }>({ type: "list_themes" });
		if (!result.ok) return { ok: false, error: result.error };
		const themes = Array.isArray(result.data?.themes)
			? result.data.themes.filter(
					(theme): theme is ThemeSummary =>
						typeof theme === "object" &&
						theme !== null &&
						typeof (theme as { name?: unknown }).name === "string" &&
						((theme as { source?: unknown }).source === "builtin" ||
							(theme as { source?: unknown }).source === "custom"),
				)
			: [];
		return { ok: true, data: themes };
	}

	async getThemeSnapshot(name?: string): Promise<RpcResult<ResolvedThemeCss>> {
		const result = await this.command<Partial<ResolvedThemeCss>>({
			type: "get_theme_snapshot",
			...(name?.trim() ? { name: name.trim() } : {}),
		});
		if (!result.ok) return { ok: false, error: result.error };
		if (
			typeof result.data?.name !== "string" ||
			typeof result.data.cssVariables !== "object" ||
			result.data.cssVariables === null
		) {
			return { ok: false, error: "Engine returned an invalid theme snapshot" };
		}
		return { ok: true, data: { name: result.data.name, cssVariables: result.data.cssVariables } };
	}

	async setTheme(name: string): Promise<RpcResult<ResolvedThemeCss>> {
		const result = await this.command<Partial<ResolvedThemeCss>>({ type: "set_theme", name });
		if (!result.ok) return { ok: false, error: result.error };
		if (
			typeof result.data?.name !== "string" ||
			typeof result.data.cssVariables !== "object" ||
			result.data.cssVariables === null
		) {
			return { ok: false, error: "Engine returned an invalid theme snapshot" };
		}
		return { ok: true, data: { name: result.data.name, cssVariables: result.data.cssVariables } };
	}

	async compact(): Promise<RpcResult> {
		return await this.command({ type: "compact" }, 120_000);
	}

	async getTree(): Promise<RpcResult<{ nodes: SessionTreeNodeInfo[]; leafId: string | null }>> {
		const result = await this.command<{ tree?: unknown[]; leafId?: string | null }>({ type: "get_tree" });
		if (!result.ok) return { ok: false, error: result.error };
		const nodes = Array.isArray(result.data?.tree) ? result.data.tree.map(mapTreeNode) : [];
		return {
			ok: true,
			data: {
				nodes,
				leafId: typeof result.data?.leafId === "string" ? result.data.leafId : null,
			},
		};
	}

	async navigateTree(
		targetId: string,
		options?: TreeNavigationOptions,
	): Promise<RpcResult<{ cancelled: boolean; editorText?: string }>> {
		const result = await this.command<{ cancelled?: boolean; editorText?: string }>({
			type: "navigate_tree",
			targetId,
			...(options ? { options } : {}),
		});
		if (!result.ok) return { ok: false, error: result.error };
		return {
			ok: true,
			data: {
				cancelled: result.data?.cancelled === true,
				...(typeof result.data?.editorText === "string" ? { editorText: result.data.editorText } : {}),
			},
		};
	}
	async runEngineCommand<T = unknown>(
		command: { type: string; [key: string]: unknown },
		timeoutMs?: number,
	): Promise<RpcResult<T>> {
		return await this.command<T>(command, timeoutMs);
	}

	async setTreeLabel(entryId: string, label?: string): Promise<RpcResult> {
		return await this.command({ type: "set_label", entryId, ...(label?.trim() ? { label: label.trim() } : {}) });
	}

	sendEngineCommand(command: { type: string; [key: string]: unknown }): void {
		if (!this.child?.stdin || this.status.state !== "ready") {
			throw new Error("Engine is not ready");
		}
		this.child.stdin.write(serializeJsonLine(command));
	}

	async getCommands(): Promise<RpcResult<SlashCommandInfo[]>> {
		const result = await this.command<{ commands?: SlashCommandInfo[] } | SlashCommandInfo[]>({
			type: "get_commands",
		});
		if (!result.ok) return { ok: false, error: result.error };
		const raw = Array.isArray(result.data)
			? result.data
			: Array.isArray(result.data?.commands)
				? result.data.commands
				: [];
		const data = raw.filter(
			(command): command is SlashCommandInfo =>
				typeof command === "object" &&
				command !== null &&
				typeof command.name === "string" &&
				(command.source === "extension" || command.source === "prompt" || command.source === "skill"),
		);
		return { ok: true, data };
	}

	async getCommandCompletions(
		commandName: string,
		argumentPrefix: string,
	): Promise<RpcResult<CommandCompletionInfo[] | null>> {
		const result = await this.command<{ completions?: unknown }>({
			type: "get_command_completions",
			commandName,
			argumentPrefix,
		});
		if (!result.ok) return { ok: false, error: result.error };
		if (result.data?.completions === null) return { ok: true, data: null };
		const completions = Array.isArray(result.data?.completions)
			? result.data.completions
					.filter(
						(item): item is { value: string; label: string; description?: string } =>
							typeof item === "object" &&
							item !== null &&
							typeof (item as { value?: unknown }).value === "string" &&
							typeof (item as { label?: unknown }).label === "string",
					)
					.map((item) => ({
						value: item.value,
						label: item.label,
						description: typeof item.description === "string" ? item.description : undefined,
					}))
			: [];
		return { ok: true, data: completions };
	}

	async getAutocomplete(text: string, cursorOffset: number): Promise<RpcResult<EngineAutocompleteSuggestion[]>> {
		const result = await this.command<{ suggestions?: unknown }>({
			type: "autocomplete_query",
			queryKey: "composer",
			text,
			cursorOffset,
		});
		if (!result.ok) return { ok: false, error: result.error };
		const suggestions = Array.isArray(result.data?.suggestions)
			? result.data.suggestions.filter(
					(suggestion): suggestion is EngineAutocompleteSuggestion =>
						typeof suggestion === "object" &&
						suggestion !== null &&
						typeof (suggestion as { value?: unknown }).value === "string" &&
						typeof (suggestion as { label?: unknown }).label === "string" &&
						typeof (suggestion as { text?: unknown }).text === "string" &&
						typeof (suggestion as { cursorOffset?: unknown }).cursorOffset === "number",
				)
			: [];
		return { ok: true, data: suggestions };
	}

	async interceptTerminalInput(data: string): Promise<RpcResult<TerminalInputInterception>> {
		const result = await this.command<Partial<TerminalInputInterception>>({ type: "intercept_terminal_input", data });
		if (!result.ok) return { ok: false, error: result.error };
		if (typeof result.data?.consumed !== "boolean") {
			return { ok: false, error: "Engine returned an invalid terminal interception response" };
		}
		return {
			ok: true,
			data: {
				consumed: result.data.consumed,
				...(typeof result.data.data === "string" ? { data: result.data.data } : {}),
			},
		};
	}

	async getEntries(options?: {
		offset?: number;
		limit?: number;
	}): Promise<RpcResult<{ entries: unknown[]; leafId: string | null; total: number; nextOffset: number | null }>> {
		const result = await this.command<{ entries?: unknown; leafId?: unknown; total?: unknown; nextOffset?: unknown }>(
			{
				type: "get_entries",
				...options,
			},
			TRANSCRIPT_READ_TIMEOUT_MS,
		);
		if (!result.ok) return { ok: false, error: result.error };
		return {
			ok: true,
			data: {
				entries: Array.isArray(result.data?.entries) ? result.data.entries : [],
				leafId: typeof result.data?.leafId === "string" ? result.data.leafId : null,
				total: typeof result.data?.total === "number" ? result.data.total : 0,
				nextOffset: typeof result.data?.nextOffset === "number" ? result.data.nextOffset : null,
			},
		};
	}

	async getShortcuts(): Promise<RpcResult<ExtensionShortcutInfo[]>> {
		const result = await this.command<{ shortcuts?: unknown }>({ type: "get_shortcuts" });
		if (!result.ok) return { ok: false, error: result.error };
		const shortcuts = Array.isArray(result.data?.shortcuts)
			? result.data.shortcuts
					.filter(
						(item): item is { key: string; description?: string } =>
							typeof item === "object" && item !== null && typeof (item as { key?: unknown }).key === "string",
					)
					.map((item) => ({
						key: item.key,
						description: typeof item.description === "string" ? item.description : undefined,
					}))
			: [];
		return { ok: true, data: shortcuts };
	}

	async invokeShortcut(key: string): Promise<RpcResult> {
		return await this.command({ type: "invoke_shortcut", key });
	}

	async getModels(): Promise<RpcResult<ModelInfo[]>> {
		const catalog = await this.getAuthCatalog();
		if (!catalog.ok || !catalog.data) return { ok: false, error: catalog.error };
		return { ok: true, data: catalog.data.models };
	}

	async getAuthCatalog(): Promise<RpcResult<AuthCatalog>> {
		const result = await this.command<{
			models?: Array<{ provider?: string; id?: string; name?: string; thinking?: boolean }>;
			scopedModels?: Array<{
				model?: { provider?: string; id?: string; name?: string; thinking?: boolean };
				thinkingLevel?: string;
			}>;
			oauthProviders?: Array<{
				id?: string;
				name?: string;
				loginLabel?: string;
				usesCallbackServer?: boolean;
			}>;
			apiKeyProviders?: Array<{ id?: string; name?: string }>;
			logoutProviders?: unknown[];
		}>({ type: "get_available_models" });
		if (!result.ok) return { ok: false, error: result.error };
		const mapModel = (model: { provider?: string; id?: string; name?: string; thinking?: boolean }): ModelInfo => ({
			provider: model.provider as string,
			id: model.id as string,
			...(typeof model.name === "string" ? { name: model.name } : {}),
			...(typeof model.thinking === "boolean" ? { thinking: model.thinking } : {}),
		});
		const models = (result.data?.models ?? [])
			.filter((model) => typeof model.provider === "string" && typeof model.id === "string")
			.map(mapModel);
		const scopedModels = (result.data?.scopedModels ?? [])
			.filter(
				(
					scoped,
				): scoped is {
					model: { provider: string; id: string; name?: string; thinking?: boolean };
					thinkingLevel?: string;
				} => typeof scoped.model?.provider === "string" && typeof scoped.model?.id === "string",
			)
			.map((scoped) => ({
				model: { ...mapModel(scoped.model), scoped: true, scopedThinkingLevel: scoped.thinkingLevel },
				thinkingLevel: typeof scoped.thinkingLevel === "string" ? scoped.thinkingLevel : undefined,
			}));
		const scopedIds = new Map(scopedModels.map((scoped) => [`${scoped.model.provider}/${scoped.model.id}`, scoped]));
		const displayModels =
			scopedModels.length > 0
				? models.map((model) => {
						const scoped = scopedIds.get(`${model.provider}/${model.id}`);
						return scoped ? { ...model, scoped: true, scopedThinkingLevel: scoped.thinkingLevel } : model;
					})
				: models;
		const oauthProviders: OAuthProviderInfo[] = (result.data?.oauthProviders ?? [])
			.filter((provider) => typeof provider.id === "string" && typeof provider.name === "string")
			.map((provider) => ({
				id: provider.id as string,
				name: provider.name as string,
				loginLabel: typeof provider.loginLabel === "string" ? provider.loginLabel : undefined,
				usesCallbackServer:
					typeof provider.usesCallbackServer === "boolean" ? provider.usesCallbackServer : undefined,
			}));
		const apiKeyProviders = (result.data?.apiKeyProviders ?? [])
			.filter(
				(provider): provider is { id: string; name: string } =>
					typeof provider.id === "string" && typeof provider.name === "string",
			)
			.map((provider) => ({ id: provider.id, name: provider.name }));
		const apiKeyProviderIds = new Set(apiKeyProviders.map((provider) => provider.id));
		const providers = [...new Set([...apiKeyProviderIds, ...oauthProviders.map((provider) => provider.id)])].sort();
		const logoutProviders = (result.data?.logoutProviders ?? []).filter(
			(provider): provider is string => typeof provider === "string" && providers.includes(provider),
		);
		return {
			ok: true,
			data: { models: displayModels, scopedModels, apiKeyProviders, oauthProviders, logoutProviders, providers },
		};
	}

	async loginProvider(provider: string, authType: "api_key" | "oauth" = "api_key"): Promise<RpcResult> {
		return await this.command({ type: "login_provider", provider, authType, loginId: provider }, 300_000);
	}

	async logoutProvider(provider: string): Promise<RpcResult> {
		return await this.command({ type: "logout_provider", provider });
	}

	async cancelLoginProvider(provider: string): Promise<RpcResult> {
		return await this.command({ type: "cancel_login_provider", provider, loginId: provider });
	}

	async setModel(provider: string, modelId: string): Promise<RpcResult> {
		const result = await this.command({ type: "set_model", provider, modelId });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async cycleModel(direction: "forward" | "backward" = "forward"): Promise<RpcResult<{ label: string } | null>> {
		const result = await this.command<{
			model?: { provider?: string; id?: string; name?: string };
			thinkingLevel?: string;
		} | null>({ type: "cycle_model", direction });
		await this.refreshState().catch(() => undefined);
		if (!result.ok) return { ok: false, error: result.error };
		if (!result.data?.model) return { ok: true, data: null };
		const model = result.data.model;
		const label = `${model.provider ?? "?"}/${model.id ?? model.name ?? "?"}`;
		return { ok: true, data: { label } };
	}

	async setThinkingLevel(level: string): Promise<RpcResult> {
		const result = await this.command({ type: "set_thinking_level", level });
		await this.refreshState().catch(() => undefined);
		return result;
	}

	async cycleThinking(): Promise<RpcResult<{ level: string } | null>> {
		const result = await this.command<{ level?: string } | null>({ type: "cycle_thinking_level" });
		await this.refreshState().catch(() => undefined);
		if (!result.ok) return { ok: false, error: result.error };
		if (!result.data || typeof result.data.level !== "string") return { ok: true, data: null };
		return { ok: true, data: { level: result.data.level } };
	}

	async getAvailableThinkingLevels(): Promise<RpcResult<string[]>> {
		const result = await this.command<{ levels?: unknown }>({ type: "get_available_thinking_levels" });
		if (!result.ok) return { ok: false, error: result.error };
		return {
			ok: true,
			data: Array.isArray(result.data?.levels)
				? result.data.levels.filter((level): level is string => typeof level === "string")
				: [],
		};
	}

	async setSteeringMode(mode: "all" | "one-at-a-time"): Promise<RpcResult> {
		return await this.command({ type: "set_steering_mode", mode });
	}

	async setFollowUpMode(mode: "all" | "one-at-a-time"): Promise<RpcResult> {
		return await this.command({ type: "set_follow_up_mode", mode });
	}

	async setAutoCompaction(enabled: boolean): Promise<RpcResult> {
		return await this.command({ type: "set_auto_compaction", enabled });
	}

	async setAutoRetry(enabled: boolean): Promise<RpcResult> {
		return await this.command({ type: "set_auto_retry", enabled });
	}

	async getSessionStats(): Promise<RpcResult<SessionStatsSummary>> {
		const result = await this.command<{
			tokens?: SessionStatsSummary["tokens"];
			cost?: number;
			contextUsage?: { percent?: number | null };
		}>({ type: "get_session_stats" });
		if (!result.ok || !result.data?.tokens) return { ok: false, error: result.error ?? "No stats" };
		return {
			ok: true,
			data: {
				tokens: result.data.tokens,
				cost: typeof result.data.cost === "number" ? result.data.cost : 0,
				contextPercent: result.data.contextUsage?.percent ?? null,
				sessionName: this.status.sessionName,
				modelLabel: this.status.modelLabel,
				thinkingLevel: this.status.thinkingLevel,
			},
		};
	}

	async listSessions(options: { cwd?: string; all?: boolean } = {}): Promise<RpcResult<SessionListItem[]>> {
		const result = await this.command<{ sessions?: unknown }>({ type: "list_sessions", ...options });
		if (!result.ok) return { ok: false, error: result.error };
		const sessions = Array.isArray(result.data?.sessions)
			? result.data.sessions
					.filter(
						(item): item is SessionListItem =>
							typeof item === "object" &&
							item !== null &&
							typeof (item as { path?: unknown }).path === "string" &&
							typeof (item as { id?: unknown }).id === "string" &&
							typeof (item as { cwd?: unknown }).cwd === "string" &&
							typeof (item as { modified?: unknown }).modified === "number" &&
							typeof (item as { created?: unknown }).created === "number" &&
							typeof (item as { messageCount?: unknown }).messageCount === "number" &&
							typeof (item as { firstMessage?: unknown }).firstMessage === "string",
					)
					.map((item) => ({
						path: item.path,
						id: item.id,
						cwd: item.cwd,
						...(typeof item.name === "string" ? { name: item.name } : {}),
						modified: item.modified,
						created: item.created,
						messageCount: item.messageCount,
						firstMessage: item.firstMessage,
					}))
			: [];
		return { ok: true, data: sessions };
	}

	async refreshState(): Promise<RpcResult<EngineStatus>> {
		const result = await this.command<{
			sessionFile?: string;
			sessionName?: string;
			thinkingLevel?: string;
			model?: { provider?: string; id?: string; name?: string };
		}>({ type: "get_state" });
		if (!result.ok) return { ok: false, error: result.error };
		const model = result.data?.model;
		const modelLabel = model ? `${model.provider ?? "?"}/${model.id ?? model.name ?? "?"}` : undefined;
		this.setStatus({
			...this.status,
			sessionFile: result.data?.sessionFile,
			sessionName: result.data?.sessionName,
			thinkingLevel: result.data?.thinkingLevel,
			modelLabel,
		});
		return { ok: true, data: this.getStatus() };
	}

	async respondExtensionUi(response: ExtensionUiResponse): Promise<void> {
		if (!this.child?.stdin || this.status.state !== "ready") {
			throw new Error("Engine is not ready");
		}
		this.child.stdin.write(
			serializeJsonLine({
				type: "extension_ui_response",
				...response,
			}),
		);
	}

	private async command<T = unknown>(
		body: { type: string; [key: string]: unknown },
		timeoutMs = 15_000,
	): Promise<RpcResult<T>> {
		if (!this.child?.stdin || this.status.state !== "ready") {
			return { ok: false, error: "Engine is not ready" };
		}
		const id = `gui-${++this.requestId}`;
		return (await this.request({ ...body, id }, timeoutMs)) as RpcResult<T>;
	}

	private request(
		command: { id: string; type: string; [key: string]: unknown },
		timeoutMs = 15_000,
	): Promise<RpcResult> {
		const stdin = this.child?.stdin;
		if (!stdin) return Promise.reject(new Error("Engine is not ready"));
		return new Promise<RpcResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(command.id);
				resolve({
					ok: false,
					error: `Timed out waiting for ${command.type}`,
					...(pending.accepted ? { requestAccepted: true } : {}),
				});
			}, timeoutMs);
			const pending = {
				resolve: (value: RpcResult) => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: (error: Error) => {
					clearTimeout(timer);
					reject(error);
				},
				accepted: false,
			};
			this.pending.set(command.id, pending);
			try {
				stdin.write(serializeJsonLine(command));
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(command.id);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private handleLine(line: string): void {
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			return;
		}
		if (isRpcResponse(value) && value.id && this.pending.has(value.id)) {
			const pending = this.pending.get(value.id)!;
			this.pending.delete(value.id);
			pending.resolve({
				ok: value.success,
				...(value.success
					? { data: value.data }
					: { error: typeof value.error === "string" ? value.error : "Request failed" }),
			});
			return;
		}
		if (isEngineMessage(value) && value.type === "engine_request_accepted") {
			const requestId = (value as { requestId?: unknown }).requestId;
			if (typeof requestId === "string") {
				const pending = this.pending.get(requestId);
				if (pending) pending.accepted = true;
			}
		}
		if (isExtensionUiRequest(value)) {
			// Runtime shape is validated loosely; known methods are narrowed by consumers.
			this.options.onExtensionUi?.(value as unknown as ExtensionUiRequest);
			return;
		}
		if (isEngineMessage(value) || isRpcEvent(value)) {
			this.options.onEvent?.(value as GuiRpcEvent);
		}
	}

	private setStatus(status: EngineStatus): void {
		this.status = status;
		this.options.onStatus?.(status);
	}

	private cleanupBootstrap(): void {
		removeOwnedInteractiveEngineBootstrap(this.bootstrap);
		this.bootstrap = undefined;
		if (this.guardianFile) {
			rmSync(this.guardianFile, { force: true });
			this.guardianFile = undefined;
		}
	}
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), timeoutMs);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}

/** Mirrors packages/coding-agent terminateRpcClientProcess escalation on Unix. */
function killEngineProcessTree(child: ChildProcess): void {
	if (!child.pid) {
		child.kill("SIGKILL");
		return;
	}
	if (process.platform === "win32") {
		child.kill("SIGKILL");
		return;
	}
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

function mapTreeNode(value: unknown): SessionTreeNodeInfo {
	if (typeof value !== "object" || value === null) {
		return { id: "unknown", kind: "unknown", summary: "(invalid node)", children: [] };
	}
	const node = value as {
		entry?: {
			id?: string;
			type?: string;
			message?: { role?: string; content?: unknown };
			name?: string;
			summary?: string;
			provider?: string;
			modelId?: string;
			thinkingLevel?: string;
		};
		label?: string;
		children?: unknown[];
	};
	const entry = node.entry ?? {};
	const id = typeof entry.id === "string" ? entry.id : randomNodeId();
	const kind = typeof entry.type === "string" ? entry.type : "entry";
	let summary = kind;
	if (kind === "compaction")
		summary = typeof entry.summary === "string" ? `Compaction: ${entry.summary.slice(0, 80)}` : "Compaction";
	else if (kind === "branch_summary")
		summary = typeof entry.summary === "string" ? `Branch: ${entry.summary.slice(0, 80)}` : "Branch summary";
	else if (kind === "session_info" && typeof entry.name === "string") summary = `name: ${entry.name}`;
	else if (kind === "model_change") summary = `model: ${entry.provider ?? "?"}/${entry.modelId ?? "?"}`;
	else if (kind === "thinking_level_change") summary = `thinking: ${entry.thinkingLevel ?? "?"}`;
	else if (entry.message) {
		const role = entry.message.role ?? "message";
		const content = entry.message.content;
		let text = "";
		if (typeof content === "string") text = content;
		else if (Array.isArray(content)) {
			for (const block of content) {
				if (
					typeof block === "object" &&
					block !== null &&
					"type" in block &&
					(block as { type: string }).type === "text" &&
					"text" in block
				) {
					text = String((block as { text: unknown }).text);
					break;
				}
			}
		}
		summary = `${role}: ${text.slice(0, 80) || "(empty)"}`;
	}
	return {
		id,
		kind,
		summary,
		...(typeof node.label === "string" ? { label: node.label } : {}),
		children: Array.isArray(node.children) ? node.children.map(mapTreeNode) : [],
	};
}

function randomNodeId(): string {
	return `node-${Math.random().toString(36).slice(2, 10)}`;
}
