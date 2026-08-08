import { type ChildProcess, spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineStatus, GuiRpcEvent, PromptRequest, PromptResult } from "../shared/ipc.ts";
import {
	INTERACTIVE_ENGINE_BOOTSTRAP_FLAG,
	type InteractiveEngineBootstrapHandle,
	removeOwnedInteractiveEngineBootstrap,
	writeInteractiveEngineBootstrap,
} from "./engine-bootstrap.ts";
import {
	attachJsonlLineReader,
	INTERACTIVE_ENGINE_PROTOCOL_VERSION,
	isRpcEvent,
	isRpcResponse,
	parseEngineReady,
	serializeJsonLine,
} from "./jsonl.ts";
import { type ResolvedAtomicCli, resolveAtomicCli } from "./resolve-atomic.ts";

export interface EngineClientOptions {
	cwd?: string;
	cli?: ResolvedAtomicCli;
	apiKey?: string;
	extraArgs?: string[];
	onStatus?: (status: EngineStatus) => void;
	onEvent?: (event: GuiRpcEvent) => void;
	onRawLine?: (line: string) => void;
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
		{ resolve: (value: PromptResult) => void; reject: (error: Error) => void }
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

		const cliArgs = [
			"--mode",
			"rpc",
			"--no-session",
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
			return await ready;
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

	async prompt(request: PromptRequest): Promise<PromptResult> {
		if (!this.child?.stdin || this.status.state !== "ready") {
			return { ok: false, error: "Engine is not ready" };
		}
		const id = `gui-${++this.requestId}`;
		const command = {
			id,
			type: "prompt" as const,
			message: request.message,
			...(request.streamingBehavior ? { streamingBehavior: request.streamingBehavior } : {}),
		};
		return await this.request(command);
	}

	async abort(): Promise<PromptResult> {
		if (!this.child?.stdin || this.status.state !== "ready") {
			return { ok: false, error: "Engine is not ready" };
		}
		const id = `gui-${++this.requestId}`;
		return await this.request({ id, type: "abort" as const });
	}

	private request(command: { id: string; type: string; [key: string]: unknown }): Promise<PromptResult> {
		return new Promise<PromptResult>((resolve, reject) => {
			this.pending.set(command.id, { resolve, reject });
			try {
				this.child!.stdin!.write(serializeJsonLine(command));
			} catch (error) {
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
				...(value.success ? {} : { error: value.error ?? "Request failed" }),
			});
			return;
		}
		if (isRpcEvent(value)) {
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
