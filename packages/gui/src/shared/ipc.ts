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
	images?: PromptImage[];
}

/** Serializable image payload accepted by Atomic's RPC prompt command (engine `ImageContent`). */
export interface PromptImage {
	type: "image";
	data: string;
	mimeType: string;
}

export interface RpcResult<T = unknown> {
	ok: boolean;
	error?: string;
	data?: T;
}

export type PromptResult = RpcResult;

export interface GuiBashResult {
	requestId: string;
	output?: string;
	exitCode?: number;
	cancelled?: boolean;
	truncated?: boolean;
	fullOutputPath?: string;
}

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	hasArgumentCompletions?: boolean;
}

export interface CommandCompletionInfo {
	value: string;
	label: string;
	description?: string;
}

export interface ExtensionShortcutInfo {
	key: string;
	description?: string;
}

export interface ModelInfo {
	provider: string;
	id: string;
	name?: string;
	thinking?: boolean;
	/** Present when this model came from the engine's session-scoped model catalog. */
	scoped?: boolean;
	scopedThinkingLevel?: string;
}

export interface ScopedModelInfo {
	model: ModelInfo;
	thinkingLevel?: string;
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

/** Row shape for `ctx.ui.hostSessionPicker` over the engine protocol. */
export interface HostSessionPickerRow {
	path: string;
	id: string;
	cwd: string;
	createdAt: number;
	modifiedAt: number;
	messageCount: number;
	firstMessage: string;
	name?: string;
	messageColor?: "success" | "warning" | "accent" | "error";
}

export interface HostSessionPickerState {
	componentId: string;
	sessions: HostSessionPickerRow[];
	showRenameHint: boolean;
	errorMessage?: string;
}

export interface FileMentionItem {
	path: string;
	label: string;
}

export interface SessionTreeNodeInfo {
	id: string;
	kind: string;
	summary: string;
	label?: string;
	children: SessionTreeNodeInfo[];
}

export interface TreeNavigationOptions {
	summarize?: boolean;
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
}

export interface ForkMessageInfo {
	entryId: string;
	text: string;
}

export interface ThemeSummary {
	name: string;
	source: "builtin" | "user" | "project";
	path: string;
}

export interface ResolvedThemeCss {
	name: string;
	cssVariables: Record<string, string>;
}

export interface GuiSettingsSnapshot {
	theme: string;
	path: string;
	exists: boolean;
	globalPath: string;
	projectPath: string;
	globalExists: boolean;
	projectExists: boolean;
	projectOverridesTheme: boolean;
}

export interface OAuthProviderInfo {
	id: string;
	name: string;
	loginLabel?: string;
	usesCallbackServer?: boolean;
}

export interface AuthCatalog {
	models: ModelInfo[];
	scopedModels: ScopedModelInfo[];
	oauthProviders: OAuthProviderInfo[];
	providers: string[];
}

export interface TrustStatus {
	cwd: string;
	needsTrustPrompt: boolean;
	decision: boolean | null;
	hasProjectResources: boolean;
}

export interface TrustOption {
	id: string;
	label: string;
	trusted: boolean;
	persistPath: string | null;
}

export interface InputFormField {
	name: string;
	type: string;
	initialValue: string;
	description?: string;
	required?: boolean;
	choices?: string[];
	placeholder?: string;
}

export interface InputFormRequest {
	componentId: string;
	title: string;
	fields: InputFormField[];
	heading?: string;
	submitLabel?: string;
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
			method: "setWorking";
			message?: string;
			visible?: boolean;
			frames?: string[];
			intervalMs?: number;
			resetMessage?: boolean;
			resetIndicator?: boolean;
	  }
	| { id: string; method: "setHiddenThinkingLabel"; label?: string }
	| {
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { id: string; method: "setTitle"; title: string }
	| { id: string; method: "set_editor_text"; text: string }
	| {
			id: string;
			method: "oauth_auth";
			provider: string;
			loginId: string;
			info: { url: string; instructions?: string };
	  }
	| {
			id: string;
			method: "oauth_device_code";
			provider: string;
			loginId: string;
			info: { userCode: string; verificationUri: string; intervalSeconds?: number; expiresInSeconds?: number };
	  }
	| { id: string; method: "oauth_progress"; provider: string; loginId: string; message: string }
	| {
			id: string;
			method: "oauth_info";
			provider: string;
			loginId: string;
			message: string;
			links: Array<{ label?: string; url: string }>;
	  }
	| {
			id: string;
			method: "oauth_prompt";
			provider: string;
			loginId: string;
			prompt: { message: string; placeholder?: string; allowEmpty?: boolean };
	  }
	| {
			id: string;
			method: "oauth_select";
			provider: string;
			loginId: string;
			prompt: { message: string; options: Array<{ id: string; label: string }> };
	  }
	| { id: string; method: "oauth_manual_code"; provider: string; loginId: string }
	| { id: string; method: "oauth_manual_code_cancel"; provider: string; loginId: string };

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
	bash(command: string, excludeFromContext?: boolean, requestId?: string): Promise<RpcResult<GuiBashResult>>;
	newSession(): Promise<PromptResult>;
	switchSession(sessionPath: string): Promise<PromptResult>;
	setSessionName(name: string): Promise<PromptResult>;
	cloneSession(): Promise<PromptResult>;
	forkSession(entryId: string): Promise<RpcResult<{ text?: string; cancelled: boolean }>>;
	getForkMessages(): Promise<RpcResult<ForkMessageInfo[]>>;
	importSession(inputPath: string, cwdOverride?: string): Promise<RpcResult<{ cancelled: boolean }>>;
	exportHtml(outputPath?: string): Promise<RpcResult<{ path: string }>>;
	compact(): Promise<PromptResult>;
	getTree(): Promise<RpcResult<{ nodes: SessionTreeNodeInfo[]; leafId: string | null }>>;
	navigateTree(
		targetId: string,
		options?: TreeNavigationOptions,
	): Promise<RpcResult<{ cancelled: boolean; editorText?: string }>>;
	setTreeLabel(entryId: string, label?: string): Promise<PromptResult>;
	getCommands(): Promise<RpcResult<SlashCommandInfo[]>>;
	getCommandCompletions(
		commandName: string,
		argumentPrefix: string,
	): Promise<RpcResult<CommandCompletionInfo[] | null>>;
	getEntries(): Promise<RpcResult<{ entries: unknown[]; leafId: string | null }>>;
	getShortcuts(): Promise<RpcResult<ExtensionShortcutInfo[]>>;
	invokeShortcut(key: string): Promise<RpcResult>;
	getModels(): Promise<RpcResult<ModelInfo[]>>;
	getAuthCatalog(): Promise<RpcResult<AuthCatalog>>;
	loginProvider(provider: string, authType?: "api_key" | "oauth"): Promise<PromptResult>;
	logoutProvider(provider: string): Promise<PromptResult>;
	cancelLoginProvider(provider: string): Promise<PromptResult>;
	setModel(provider: string, modelId: string): Promise<PromptResult>;
	cycleModel(direction?: "forward" | "backward"): Promise<RpcResult<{ label: string } | null>>;
	setThinkingLevel(level: string): Promise<PromptResult>;
	cycleThinking(): Promise<RpcResult<{ level: string } | null>>;
	getAvailableThinkingLevels(): Promise<RpcResult<string[]>>;
	setSteeringMode(mode: "all" | "one-at-a-time"): Promise<PromptResult>;
	setFollowUpMode(mode: "all" | "one-at-a-time"): Promise<PromptResult>;
	setAutoCompaction(enabled: boolean): Promise<PromptResult>;
	setAutoRetry(enabled: boolean): Promise<PromptResult>;
	getSessionStats(): Promise<RpcResult<SessionStatsSummary>>;
	refreshState(): Promise<RpcResult<EngineStatus>>;
	listSessions(options?: { cwd?: string; all?: boolean }): Promise<SessionListItem[]>;
	renameSession(sessionPath: string, name: string): Promise<RpcResult>;
	deleteSession(sessionPath: string): Promise<RpcResult>;
	searchFiles(query: string, cwd?: string): Promise<FileMentionItem[]>;
	listThemes(): Promise<ThemeSummary[]>;
	getThemeCss(name?: string): Promise<ResolvedThemeCss>;
	getSettings(): Promise<GuiSettingsSnapshot>;
	setTheme(name: string): Promise<ResolvedThemeCss>;
	getTrustStatus(cwd?: string): Promise<TrustStatus>;
	getTrustOptions(cwd?: string): Promise<TrustOption[]>;
	applyTrust(optionId: string, cwd?: string): Promise<TrustStatus>;
	submitInputForm(componentId: string, values: Record<string, string>): Promise<void>;
	cancelInputForm(componentId: string): Promise<void>;
	runEngineCommand<T = unknown>(command: { type: string; [key: string]: unknown }): Promise<RpcResult<T>>;
	editExternally(text: string): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
	sendEngineCommand(command: { type: string; [key: string]: unknown }): Promise<void>;
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
	cloneSession: "gui:clone-session",
	forkSession: "gui:fork-session",
	getForkMessages: "gui:get-fork-messages",
	importSession: "gui:import-session",
	exportHtml: "gui:export-html",
	compact: "gui:compact",
	getTree: "gui:get-tree",
	navigateTree: "gui:navigate-tree",
	setTreeLabel: "gui:set-tree-label",
	getCommands: "gui:get-commands",
	getCommandCompletions: "gui:get-command-completions",
	getEntries: "gui:get-entries",
	getShortcuts: "gui:get-shortcuts",
	invokeShortcut: "gui:invoke-shortcut",
	getModels: "gui:get-models",
	getAuthCatalog: "gui:get-auth-catalog",
	loginProvider: "gui:login-provider",
	logoutProvider: "gui:logout-provider",
	cancelLoginProvider: "gui:cancel-login-provider",
	setModel: "gui:set-model",
	cycleModel: "gui:cycle-model",
	cycleThinking: "gui:cycle-thinking",
	setThinkingLevel: "gui:set-thinking-level",
	getAvailableThinkingLevels: "gui:get-available-thinking-levels",
	setSteeringMode: "gui:set-steering-mode",
	setFollowUpMode: "gui:set-follow-up-mode",
	setAutoCompaction: "gui:set-auto-compaction",
	setAutoRetry: "gui:set-auto-retry",
	getSessionStats: "gui:get-session-stats",
	refreshState: "gui:refresh-state",
	listSessions: "gui:list-sessions",
	renameSession: "gui:rename-session",
	deleteSession: "gui:delete-session",
	searchFiles: "gui:search-files",
	listThemes: "gui:list-themes",
	getThemeCss: "gui:get-theme-css",
	getSettings: "gui:get-settings",
	setTheme: "gui:set-theme",
	getTrustStatus: "gui:get-trust-status",
	getTrustOptions: "gui:get-trust-options",
	applyTrust: "gui:apply-trust",
	submitInputForm: "gui:submit-input-form",
	cancelInputForm: "gui:cancel-input-form",
	runEngineCommand: "gui:run-engine-command",
	editExternally: "gui:edit-externally",
	sendEngineCommand: "gui:send-engine-command",
	respondExtensionUi: "gui:respond-extension-ui",
	status: "gui:status",
	event: "gui:event",
	rawLine: "gui:raw-line",
	extensionUi: "gui:extension-ui",
} as const;
