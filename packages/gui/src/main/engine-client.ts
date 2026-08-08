import { type ChildProcess, spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	EngineStatus,
	ExtensionUiRequest,
	ExtensionUiResponse,
	GuiRpcEvent,
	ModelInfo,
	PromptRequest,
	RpcResult,
	SessionStatsSummary,
	SessionTreeNodeInfo,
	SlashCommandInfo,
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
	apiKey?: string;
	extraArgs?: string[];
	onStatus?: (status: EngineStatus) => void;
	onEvent?: (event: GuiRpcEvent) => void;
	onRawLine?: (line: string) => void;
	onExtensionUi?: (request: ExtensionUiRequest) => void;
}

/**
 * Host-side JSONL client for an isolated interactive-engine child.
 * Speaks protocol v2 (engine_ready handshake) plus the RPC command set.
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
		{ resolve: (value: RpcResult) => void; reject: (error: Error) => void }
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
		writeFileSync(this.guardianFile, "", { mode: 0o600 });
		this.bootstrap = writeInteractiveEngineBootstrap({
			hostPid: process.pid,
			guardFile: this.guardianFile,
			...(this.options.apiKey ? { apiKey: this.options.apiKey } : {}),
		});

		const sessionArgs = this.options.sessionPath ? ["--session", this.options.sessionPath] : ["--no-session"];
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
				env: { ...process.env },
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
		child.stderr?.on("data", (chunk: Buffer) => {
			process.stderr.write(chunk);
		});
		child.once("exit", (code, signal) => {
			for (const [, pending] of this.pending) {
				pending.reject(new Error(`Engine exited (code=${code}, signal=${signal})`));
			}
			this.pending.clear();
			this.cleanupBootstrap();
			this.child = null;
			this.stopReading?.();
			this.stopReading = null;
			if (this.status.state !== "stopped") {
				this.setStatus({
					state: "error",
					error: `Engine exited (code=${code}, signal=${signal})`,
					cliPath: cli.cliPath || cli.runtimeExecutable,
				});
			}
		});

		const ready = new Promise<EngineStatus>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Timed out waiting for engine_ready"));
			}, 60_000);
			this.stopReading = attachJsonlLineReader(child.stdout!, (line) => {
				this.options.onRawLine?.(line);
				const readyMsg = parseEngineReady(line);
				if (readyMsg) {
					if (readyMsg.protocolVersion !== INTERACTIVE_ENGINE_PROTOCOL_VERSION) {
						clearTimeout(timeout);
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
						cliPath: cli.cliPath || cli.runtimeExecutable,
						cwd: this.options.cwd ?? process.cwd(),
						sessionFile: this.options.sessionPath,
					};
					this.setStatus(next);
					clearTimeout(timeout);
					resolve(next);
					return;
				}
				this.handleLine(line);
			});
			child.once("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});

		try {
			const status = await ready;
			await this.refreshState().catch(() => undefined);
			return this.getStatus().state === "ready" ? this.getStatus() : status;
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
		this.child = null;
		this.stopReading?.();
		this.stopReading = null;
		for (const [, pending] of this.pending) {
			pending.reject(new Error("Engine stopped"));
		}
		this.pending.clear();
		if (child && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
		}
		this.cleanupBootstrap();
	}

	async prompt(request: PromptRequest): Promise<RpcResult> {
		return await this.command({
			type: "prompt",
			message: request.message,
			...(request.streamingBehavior ? { streamingBehavior: request.streamingBehavior } : {}),
		});
	}

	async abort(): Promise<RpcResult> {
		return await this.command({ type: "abort" });
	}

	async bash(command: string, excludeFromContext = false): Promise<RpcResult> {
		return await this.command({ type: "bash", command, excludeFromContext });
	}

	async newSession(): Promise<RpcResult> {
		const result = await this.command({ type: "new_session" });
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

	async exportHtml(outputPath?: string): Promise<RpcResult<{ path: string }>> {
		return await this.command<{ path: string }>({
			type: "export_html",
			...(outputPath ? { outputPath } : {}),
		});
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

	async navigateTree(targetId: string): Promise<RpcResult<{ cancelled: boolean; editorText?: string }>> {
		const result = await this.command<{ cancelled?: boolean; editorText?: string }>({
			type: "navigate_tree",
			targetId,
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
		const data = Array.isArray(result.data)
			? result.data
			: Array.isArray(result.data?.commands)
				? result.data.commands
				: [];
		return { ok: true, data };
	}

	async getModels(): Promise<RpcResult<ModelInfo[]>> {
		const result = await this.command<{
			models?: Array<{ provider?: string; id?: string; name?: string; thinking?: boolean }>;
		}>({ type: "get_available_models" });
		if (!result.ok) return { ok: false, error: result.error };
		const models = (result.data?.models ?? [])
			.filter((model) => typeof model.provider === "string" && typeof model.id === "string")
			.map((model) => ({
				provider: model.provider as string,
				id: model.id as string,
				name: typeof model.name === "string" ? model.name : undefined,
				thinking: typeof model.thinking === "boolean" ? model.thinking : undefined,
			}));
		return { ok: true, data: models };
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

	async cycleThinking(): Promise<RpcResult<{ level: string } | null>> {
		const result = await this.command<{ level?: string } | null>({ type: "cycle_thinking_level" });
		await this.refreshState().catch(() => undefined);
		if (!result.ok) return { ok: false, error: result.error };
		if (!result.data || typeof result.data.level !== "string") return { ok: true, data: null };
		return { ok: true, data: { level: result.data.level } };
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

	async refreshState(): Promise<RpcResult<EngineStatus>> {
		const result = await this.command<{
			sessionFile?: string;
			sessionName?: string;
			thinkingLevel?: string;
			model?: { provider?: string; id?: string; name?: string };
		}>({ type: "get_state" });
		if (!result.ok) return { ok: false, error: result.error };
		const model = result.data?.model;
		const modelLabel = model ? `${model.provider ?? "?"}/${model.id ?? model.name ?? "?"}` : this.status.modelLabel;
		this.setStatus({
			...this.status,
			sessionFile: result.data?.sessionFile ?? this.status.sessionFile,
			sessionName: result.data?.sessionName ?? this.status.sessionName,
			thinkingLevel: result.data?.thinkingLevel ?? this.status.thinkingLevel,
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
		return new Promise<RpcResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(command.id);
				resolve({ ok: false, error: `Timed out waiting for ${command.type}` });
			}, timeoutMs);
			this.pending.set(command.id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
			try {
				this.child!.stdin!.write(serializeJsonLine(command));
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
		if (isExtensionUiRequest(value)) {
			this.options.onExtensionUi?.(value as ExtensionUiRequest);
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

function mapTreeNode(value: unknown): SessionTreeNodeInfo {
	if (typeof value !== "object" || value === null) {
		return { id: "unknown", kind: "unknown", summary: "(invalid node)", children: [] };
	}
	const node = value as {
		entry?: { id?: string; type?: string; message?: { role?: string; content?: unknown }; name?: string };
		label?: string;
		children?: unknown[];
	};
	const entry = node.entry ?? {};
	const id = typeof entry.id === "string" ? entry.id : randomNodeId();
	const kind = typeof entry.type === "string" ? entry.type : "entry";
	let summary = kind;
	if (kind === "session_info" && typeof entry.name === "string") summary = `name: ${entry.name}`;
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
