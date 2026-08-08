/** Typed IPC contract between Electron main and the sandboxed renderer. */

export type EngineConnectionState = "idle" | "starting" | "ready" | "error" | "stopped";

export interface EngineStatus {
	state: EngineConnectionState;
	pid?: number;
	protocolVersion?: number;
	error?: string;
	cliPath?: string;
	cwd?: string;
	sessionFile?: string;
	sessionName?: string;
	modelLabel?: string;
	thinkingLevel?: string;
}

export type GuiRpcEvent = {
	type: string;
	[key: string]: unknown;
};

export interface PromptRequest {
	message: string;
	streamingBehavior?: "steer" | "followUp";
}

export interface RpcResult<T = unknown> {
	ok: boolean;
	error?: string;
	data?: T;
}

export type PromptResult = RpcResult;

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill" | "builtin";
	hasArgumentCompletions?: boolean;
}

export interface ModelInfo {
	provider: string;
	id: string;
	name?: string;
	thinking?: boolean;
}

export interface SessionListItem {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	modified: number;
	created: number;
	messageCount: number;
	firstMessage: string;
}

export interface FileMentionItem {
	path: string;
	label: string;
}

export type ExtensionUiRequest =
	| { id: string; method: "select"; title: string; options: string[]; timeout?: number }
	| { id: string; method: "confirm"; title: string; message: string; timeout?: number }
	| { id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
	| { id: string; method: "editor"; title: string; prefill?: string }
	| { id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
	| { id: string; method: "setStatus"; statusKey: string; statusText: string | undefined }
	| {
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { id: string; method: "setTitle"; title: string }
	| { id: string; method: "set_editor_text"; text: string }
	| { id: string; method: string; [key: string]: unknown };

export type ExtensionUiResponse =
	| { id: string; value: string }
	| { id: string; confirmed: boolean }
	| { id: string; cancelled: true };

export interface SessionStatsSummary {
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
	cost: number;
	contextPercent?: number | null;
	sessionName?: string;
	modelLabel?: string;
	thinkingLevel?: string;
}

export interface GuiHostApi {
	getStatus(): Promise<EngineStatus>;
	startEngine(options?: { cwd?: string; sessionPath?: string }): Promise<EngineStatus>;
	stopEngine(): Promise<void>;
	prompt(request: PromptRequest): Promise<PromptResult>;
	abort(): Promise<PromptResult>;
	bash(command: string, excludeFromContext?: boolean): Promise<PromptResult>;
	newSession(): Promise<PromptResult>;
	switchSession(sessionPath: string): Promise<PromptResult>;
	setSessionName(name: string): Promise<PromptResult>;
	getCommands(): Promise<RpcResult<SlashCommandInfo[]>>;
	getModels(): Promise<RpcResult<ModelInfo[]>>;
	setModel(provider: string, modelId: string): Promise<PromptResult>;
	cycleModel(direction?: "forward" | "backward"): Promise<RpcResult<{ label: string } | null>>;
	cycleThinking(): Promise<RpcResult<{ level: string } | null>>;
	getSessionStats(): Promise<RpcResult<SessionStatsSummary>>;
	refreshState(): Promise<RpcResult<EngineStatus>>;
	listSessions(options?: { cwd?: string; all?: boolean }): Promise<SessionListItem[]>;
	searchFiles(query: string, cwd?: string): Promise<FileMentionItem[]>;
	respondExtensionUi(response: ExtensionUiResponse): Promise<void>;
	onStatus(listener: (status: EngineStatus) => void): () => void;
	onEvent(listener: (event: GuiRpcEvent) => void): () => void;
	onRawLine(listener: (line: string) => void): () => void;
	onExtensionUi(listener: (request: ExtensionUiRequest) => void): () => void;
}

export const IPC_CHANNELS = {
	getStatus: "gui:get-status",
	startEngine: "gui:start-engine",
	stopEngine: "gui:stop-engine",
	prompt: "gui:prompt",
	abort: "gui:abort",
	bash: "gui:bash",
	newSession: "gui:new-session",
	switchSession: "gui:switch-session",
	setSessionName: "gui:set-session-name",
	getCommands: "gui:get-commands",
	getModels: "gui:get-models",
	setModel: "gui:set-model",
	cycleModel: "gui:cycle-model",
	cycleThinking: "gui:cycle-thinking",
	getSessionStats: "gui:get-session-stats",
	refreshState: "gui:refresh-state",
	listSessions: "gui:list-sessions",
	searchFiles: "gui:search-files",
	respondExtensionUi: "gui:respond-extension-ui",
	status: "gui:status",
	event: "gui:event",
	rawLine: "gui:raw-line",
	extensionUi: "gui:extension-ui",
} as const;
