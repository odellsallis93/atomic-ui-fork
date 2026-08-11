import { create } from "zustand";
import type {
	AuthCatalog,
	EngineStatus,
	ExtensionShortcutInfo,
	ExtensionUiRequest,
	GuiRpcEvent,
	HostSessionPickerRow,
	HostSessionPickerState,
	InputFormRequest,
	ModelInfo,
	SessionListItem,
	SessionTreeNodeInfo,
	SlashCommandInfo,
	ThemeSummary,
	TrustOption,
	TrustStatus,
} from "../../../shared/ipc.ts";
import { type GuiOverlayOptions, parseOverlayOptions } from "../../../shared/overlay-options.ts";

export type EntryKind =
	| "user"
	| "assistant"
	| "tool"
	| "bash"
	| "custom"
	| "skill"
	| "system"
	| "compaction"
	| "branchSummary"
	| "raw";

export interface TranscriptEntry {
	id: string;
	kind: EntryKind;
	role?: string;
	text: string;
	thinking?: string;
	toolName?: string;
	toolCallId?: string;
	bashCommand?: string;
	bashExitCode?: number;
	bashCancelled?: boolean;
	bashTruncated?: boolean;
	bashFullOutputPath?: string;
	customType?: string;
	skillName?: string;
	skillLocation?: string;
	skillContent?: string;
	/** Engine-owned component identity for a rendered live tool card. */
	remoteRenderId?: string;
	/** Inputs forwarded to the engine's ToolExecutionComponent renderer. */
	toolArgs?: unknown;
	toolResult?: unknown;
	remoteRenderLines?: string[];
	remoteRenderGeneration?: number;
	remoteRenderAppliedRequestId?: number;
	streaming: boolean;
	expanded: boolean;
	excludeFromContext?: boolean;
	error?: string;
}

export interface QueueChip {
	id: string;
	text: string;
	behavior: "steer" | "followUp";
}

export interface ToastItem {
	id: string;
	message: string;
	notifyType: "info" | "warning" | "error";
}

export interface WidgetItem {
	key: string;
	lines: string[];
	placement: "aboveEditor" | "belowEditor";
}

export type ModalKind =
	| "none"
	| "sessions"
	| "models"
	| "dialog"
	| "tree"
	| "settings"
	| "auth"
	| "trust"
	| "inputForm"
	| "hostSessionPicker";

export interface CustomFrame {
	componentId: string;
	overlay: boolean;
	chromeSlot?: "header" | "footer" | "editor";
	widgetKey?: string;
	widgetPlacement?: "aboveEditor" | "belowEditor";
	lines: string[];
	requestId?: number;
	appliedRequestId: number;
	/** Bumped when the child asks for a fresh `engine_custom_render`. */
	renderGeneration: number;
	overlayOptions?: GuiOverlayOptions;
	handlesCtrlC: boolean;
	hidden: boolean;
	focused: boolean;
	mouseScrollTracking: boolean;
	/** When false, long ANSI lines clip like a TTY with autowrap disabled. */
	terminalAutowrap: boolean;
}

export interface SessionState {
	status: EngineStatus;
	entries: TranscriptEntry[];
	working: boolean;
	workingLabel: string;
	workingVisible: boolean;
	workingIndicatorFrames?: string[];
	workingIndicatorIntervalMs?: number;
	rawLines: string[];
	showRawLog: boolean;
	hideThinking: boolean;
	hiddenThinkingLabel: string;
	queue: QueueChip[];
	composerText: string;
	promptHistory: string[];
	historyIndex: number;
	errorBanner?: string;
	usageLabel: string;
	statusSegments: Record<string, string>;
	widgets: WidgetItem[];
	toasts: ToastItem[];
	commands: SlashCommandInfo[];
	extensionShortcuts: ExtensionShortcutInfo[];
	models: ModelInfo[];
	sessions: SessionListItem[];
	treeNodes: SessionTreeNodeInfo[];
	/** Active leaf from the last tree fetch (engine-owned). */
	treeLeafId: string | null;
	/** Active leaf from the last transcript hydration (`get_entries`). */
	transcriptLeafId: string | null;
	themes: ThemeSummary[];
	themeName: string;
	frames: CustomFrame[];
	authCatalog: AuthCatalog | null;
	authBusyProvider?: string;
	trustStatus?: TrustStatus;
	trustOptions: TrustOption[];
	inputForm?: InputFormRequest;
	hostSessionPicker?: HostSessionPickerState;
	modal: ModalKind;
	activeDialog?: ExtensionUiRequest;
	setStatus: (status: EngineStatus) => void;
	setComposerText: (text: string) => void;
	pushPromptHistory: (text: string) => void;
	historyUp: () => string | undefined;
	historyDown: () => string | undefined;
	toggleRawLog: () => void;
	toggleThinking: () => void;
	appendRawLine: (line: string) => void;
	ingestEvent: (event: GuiRpcEvent) => void;
	ingestExtensionUi: (request: ExtensionUiRequest) => void;
	clearDialog: () => void;
	dismissToast: (id: string) => void;
	dismissFrame: (componentId: string) => void;
	resetTranscript: () => void;
	hydrateTranscript: (entries: unknown[], leafId?: string | null) => void;
	setErrorBanner: (message: string | undefined) => void;
	toggleEntryExpanded: (id: string) => void;
	setCommands: (commands: SlashCommandInfo[]) => void;
	setExtensionShortcuts: (shortcuts: ExtensionShortcutInfo[]) => void;
	setModels: (models: ModelInfo[]) => void;
	setSessions: (sessions: SessionListItem[]) => void;
	setTree: (nodes: SessionTreeNodeInfo[], leafId: string | null) => void;
	setThemes: (themes: ThemeSummary[]) => void;
	setThemeName: (name: string) => void;
	setAuthCatalog: (catalog: AuthCatalog | null) => void;
	setAuthBusyProvider: (provider: string | undefined) => void;
	setTrust: (status: TrustStatus, options: TrustOption[]) => void;
	clearInputForm: () => void;
	clearHostSessionPicker: () => void;
	setModal: (modal: ModalKind) => void;
	setUsageLabel: (label: string) => void;
}

let entryCounter = 0;
function nextId(prefix: string): string {
	entryCounter += 1;
	return `${prefix}-${entryCounter}`;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (typeof block === "object" && block !== null && "type" in block) {
			const typed = block as { type: string; text?: string };
			if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
			if (typed.type === "image") parts.push("[image attachment]");
		}
	}
	return parts.join("");
}

function thinkingFromContent(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined;
	const parts: string[] = [];
	for (const block of content) {
		if (
			typeof block === "object" &&
			block !== null &&
			"type" in block &&
			(block as { type: string }).type === "thinking" &&
			"thinking" in block &&
			typeof (block as { thinking: unknown }).thinking === "string"
		) {
			parts.push((block as { thinking: string }).thinking);
		}
	}
	return parts.length > 0 ? parts.join("\n") : undefined;
}

function stringify(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2) ?? "";
	} catch {
		return String(value ?? "");
	}
}

function skillFromText(
	text: string,
): Pick<TranscriptEntry, "skillName" | "skillLocation" | "skillContent" | "text"> | undefined {
	const match = text.match(/^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/);
	if (!match) return undefined;
	return {
		skillName: match[1],
		skillLocation: match[2],
		skillContent: match[3],
		text: match[4]?.trim() ?? "",
	};
}

function transcriptEntryFromMessage(
	id: string,
	message: Record<string, unknown>,
	streaming: boolean,
): TranscriptEntry | undefined {
	const role = typeof message.role === "string" ? message.role : "system";
	if (role === "bashExecution") {
		const command = typeof message.command === "string" ? message.command : "";
		const output = typeof message.output === "string" ? message.output : "";
		return {
			id,
			kind: "bash",
			role,
			bashCommand: command || undefined,
			text: `${command ? `$ ${command}\n` : ""}${output}`,
			bashExitCode: typeof message.exitCode === "number" ? message.exitCode : undefined,
			bashCancelled: message.cancelled === true,
			bashTruncated: message.truncated === true,
			bashFullOutputPath: typeof message.fullOutputPath === "string" ? message.fullOutputPath : undefined,
			streaming,
			expanded: true,
			excludeFromContext: message.excludeFromContext === true,
		};
	}
	if (role === "custom") {
		if (message.display !== true) return undefined;
		return {
			id,
			kind: "custom",
			role,
			customType: typeof message.customType === "string" ? message.customType : "custom",
			text: textFromContent(message.content),
			streaming,
			expanded: false,
		};
	}
	if (role === "branchSummary") {
		return {
			id,
			kind: "branchSummary",
			role,
			text: typeof message.summary === "string" ? message.summary : "Branch summary",
			streaming,
			expanded: false,
		};
	}
	if (role === "user") {
		const text = textFromContent(message.content);
		const skill = skillFromText(text);
		return {
			id,
			kind: skill ? "skill" : "user",
			role,
			...(skill ?? { text }),
			streaming,
			expanded: false,
		};
	}
	if (role === "assistant" || role === "toolResult") {
		const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
		return {
			id,
			kind: role === "toolResult" ? "tool" : "assistant",
			role,
			toolName: typeof message.toolName === "string" ? message.toolName : undefined,
			toolCallId,
			remoteRenderId: toolCallId ? `gui-tool-render:${toolCallId}` : undefined,
			text: textFromContent(message.content),
			thinking: role === "assistant" ? thinkingFromContent(message.content) : undefined,
			streaming,
			expanded: role === "toolResult",
			error: message.isError === true ? "Tool error" : undefined,
		};
	}
	return {
		id,
		kind: "system",
		role,
		text: textFromContent(message.content) || role,
		streaming,
		expanded: false,
	};
}

function activeLeafEntries(entries: unknown[], leafId: string | null | undefined): Record<string, unknown>[] {
	if (leafId === null || leafId === undefined) return [];
	const byId = new Map<string, Record<string, unknown>>();
	for (const entry of entries) {
		if (typeof entry !== "object" || entry === null) continue;
		const value = entry as Record<string, unknown>;
		if (typeof value.id === "string") byId.set(value.id, value);
	}
	const path: Record<string, unknown>[] = [];
	const visited = new Set<string>();
	let id: string | null = leafId;
	while (id && !visited.has(id)) {
		visited.add(id);
		const entry = byId.get(id);
		if (!entry) break;
		path.push(entry);
		id = typeof entry.parentId === "string" ? entry.parentId : null;
	}
	return path.reverse();
}

function transcriptEntriesFromSessionEntries(entries: unknown[], leafId: string | null | undefined): TranscriptEntry[] {
	const hydrated: TranscriptEntry[] = [];
	const tools = new Map<string, TranscriptEntry>();
	for (const value of activeLeafEntries(entries, leafId)) {
		if (typeof value.id !== "string" || typeof value.type !== "string") continue;
		if (value.type === "message" && typeof value.message === "object" && value.message !== null) {
			const message = value.message as Record<string, unknown>;
			if (message.role === "toolResult" && typeof message.toolCallId === "string") {
				const tool = tools.get(message.toolCallId);
				if (tool) {
					tool.toolResult = message;
					tool.text = textFromContent(message.content) || tool.text;
					tool.error = message.isError === true ? "Tool error" : undefined;
					continue;
				}
			}
			const rendered = transcriptEntryFromMessage(value.id, message, false);
			if (rendered) hydrated.push(rendered);
			if (message.role === "assistant" && Array.isArray(message.content)) {
				for (const content of message.content) {
					if (
						typeof content !== "object" ||
						content === null ||
						(content as { type?: unknown }).type !== "toolCall"
					)
						continue;
					const call = content as { id?: unknown; name?: unknown; arguments?: unknown };
					if (typeof call.id !== "string") continue;
					const tool: TranscriptEntry = {
						id: call.id,
						kind: "tool",
						toolCallId: call.id,
						toolName: typeof call.name === "string" ? call.name : "tool",
						remoteRenderId: `gui-tool-render:${call.id}`,
						toolArgs: call.arguments,
						text: stringify(call.arguments),
						streaming: false,
						expanded: false,
					};
					tools.set(call.id, tool);
					hydrated.push(tool);
				}
			}
			continue;
		}
		if (value.type === "custom_message" && value.display === true) {
			hydrated.push({
				id: value.id,
				kind: "custom",
				customType: typeof value.customType === "string" ? value.customType : "custom",
				text: textFromContent(value.content),
				streaming: false,
				expanded: false,
				excludeFromContext: value.excludeFromContext === true,
			});
			continue;
		}
		if (value.type === "custom") {
			hydrated.push({
				id: value.id,
				kind: "custom",
				customType: typeof value.customType === "string" ? value.customType : "custom",
				text: stringify(value.data),
				streaming: false,
				expanded: false,
			});
			continue;
		}
		if (value.type === "compaction") {
			hydrated.push({
				id: value.id,
				kind: "compaction",
				text: typeof value.summary === "string" ? value.summary : "Context compacted",
				streaming: false,
				expanded: false,
			});
			continue;
		}
		if (value.type === "context_compaction") continue;
		if (value.type === "branch_summary") {
			hydrated.push({
				id: value.id,
				kind: "branchSummary",
				text: typeof value.summary === "string" ? value.summary : "Branch summary",
				streaming: false,
				expanded: false,
			});
		}
	}
	return hydrated;
}

function parseHostSessionPickerRows(value: unknown): HostSessionPickerRow[] {
	if (!Array.isArray(value)) return [];
	const rows: HostSessionPickerRow[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) continue;
		const row = item as Record<string, unknown>;
		if (typeof row.path !== "string" || typeof row.id !== "string" || typeof row.cwd !== "string") continue;
		if (typeof row.createdAt !== "number" || typeof row.modifiedAt !== "number") continue;
		if (typeof row.messageCount !== "number" || typeof row.firstMessage !== "string") continue;
		const messageColor = row.messageColor;
		const colorOk =
			messageColor === undefined ||
			messageColor === "success" ||
			messageColor === "warning" ||
			messageColor === "accent" ||
			messageColor === "error";
		if (!colorOk) continue;
		rows.push({
			path: row.path,
			id: row.id,
			cwd: row.cwd,
			createdAt: row.createdAt,
			modifiedAt: row.modifiedAt,
			messageCount: row.messageCount,
			firstMessage: row.firstMessage,
			name: typeof row.name === "string" ? row.name : undefined,
			messageColor: messageColor as HostSessionPickerRow["messageColor"],
		});
	}
	return rows;
}

function formatUsage(
	tokens?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	},
	cost?: number,
	contextPercent?: number | null,
): string {
	if (!tokens) return "—";
	const ctx = contextPercent === null || contextPercent === undefined ? "?" : `${contextPercent.toFixed(1)}%`;
	const costLabel = typeof cost === "number" ? `$${cost.toFixed(4)}` : "";
	return `↑${tokens.input} ↓${tokens.output} R${tokens.cacheRead} W${tokens.cacheWrite} · ${ctx}${costLabel ? ` · ${costLabel}` : ""}`;
}

export const useSessionStore = create<SessionState>((set, get) => ({
	status: { state: "idle" },
	entries: [],
	working: false,
	workingLabel: "thinking",
	workingVisible: true,
	rawLines: [],
	showRawLog: false,
	hideThinking: false,
	hiddenThinkingLabel: "Thinking...",
	queue: [],
	composerText: "",
	promptHistory: [],
	historyIndex: -1,
	usageLabel: "—",
	statusSegments: {},
	widgets: [],
	toasts: [],
	commands: [],
	extensionShortcuts: [],
	models: [],
	sessions: [],
	treeNodes: [],
	treeLeafId: null,
	transcriptLeafId: null,
	themes: [],
	themeName: "dark",
	frames: [],
	authCatalog: null,
	trustOptions: [],
	modal: "none",
	setStatus: (status) => set({ status, errorBanner: status.error }),
	setComposerText: (text) => set({ composerText: text, historyIndex: -1 }),
	pushPromptHistory: (text) =>
		set((state) => ({
			promptHistory: [...state.promptHistory.filter((item) => item !== text), text].slice(-100),
			historyIndex: -1,
		})),
	historyUp: () => {
		const { promptHistory, historyIndex, composerText } = get();
		if (promptHistory.length === 0) return undefined;
		const next = historyIndex < 0 ? promptHistory.length - 1 : Math.max(0, historyIndex - 1);
		set({ historyIndex: next, composerText: promptHistory[next] ?? composerText });
		return promptHistory[next];
	},
	historyDown: () => {
		const { promptHistory, historyIndex } = get();
		if (historyIndex < 0) return undefined;
		if (historyIndex >= promptHistory.length - 1) {
			set({ historyIndex: -1, composerText: "" });
			return "";
		}
		const next = historyIndex + 1;
		set({ historyIndex: next, composerText: promptHistory[next] ?? "" });
		return promptHistory[next];
	},
	toggleRawLog: () => set({ showRawLog: !get().showRawLog }),
	toggleThinking: () => set({ hideThinking: !get().hideThinking }),
	appendRawLine: (line) =>
		set((state) => ({
			rawLines: [...state.rawLines.slice(-400), line],
		})),
	resetTranscript: () =>
		set({
			entries: [],
			queue: [],
			working: false,
			frames: [],
			transcriptLeafId: null,
			treeLeafId: null,
			treeNodes: [],
		}),
	hydrateTranscript: (entries, leafId) => {
		const hydrated = transcriptEntriesFromSessionEntries(entries, leafId);
		const activeLeafId = leafId === undefined ? null : leafId;
		set({
			entries: hydrated,
			queue: [],
			working: false,
			workingLabel: "thinking",
			transcriptLeafId: activeLeafId,
			treeLeafId: activeLeafId,
		});
	},
	setErrorBanner: (message) => set({ errorBanner: message }),
	toggleEntryExpanded: (id) =>
		set((state) => ({
			entries: state.entries.map((entry) => (entry.id === id ? { ...entry, expanded: !entry.expanded } : entry)),
		})),
	setCommands: (commands) => set({ commands }),
	setExtensionShortcuts: (extensionShortcuts) => set({ extensionShortcuts }),
	setModels: (models) => set({ models }),
	setSessions: (sessions) => set({ sessions }),
	setTree: (nodes, leafId) => set({ treeNodes: nodes, treeLeafId: leafId }),
	setThemes: (themes) => set({ themes }),
	setThemeName: (name) => set({ themeName: name }),
	setAuthCatalog: (catalog) => set({ authCatalog: catalog }),
	setAuthBusyProvider: (provider) => set({ authBusyProvider: provider }),
	setTrust: (status, options) => set({ trustStatus: status, trustOptions: options }),
	clearInputForm: () => set({ inputForm: undefined, modal: get().modal === "inputForm" ? "none" : get().modal }),
	clearHostSessionPicker: () =>
		set({ hostSessionPicker: undefined, modal: get().modal === "hostSessionPicker" ? "none" : get().modal }),
	setModal: (modal) => set({ modal }),
	setUsageLabel: (label) => set({ usageLabel: label }),
	dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
	dismissFrame: (componentId) =>
		set((state) => ({ frames: state.frames.filter((frame) => frame.componentId !== componentId) })),
	clearDialog: () => set({ activeDialog: undefined, modal: get().modal === "dialog" ? "none" : get().modal }),
	ingestExtensionUi: (request) => {
		if (request.method === "oauth_manual_code_cancel") {
			set({ activeDialog: undefined, modal: get().modal === "dialog" ? "none" : get().modal });
			return;
		}
		if (request.method === "oauth_progress" || request.method === "oauth_info") {
			const toast: ToastItem = {
				id: request.id,
				message: typeof request.message === "string" ? request.message : "OAuth update",
				notifyType: "info",
			};
			set((state) => ({ toasts: [...state.toasts.slice(-4), toast] }));
			if (request.method === "oauth_info") {
				set({ activeDialog: request, modal: "dialog" });
			}
			return;
		}
		if (
			request.method === "oauth_auth" ||
			request.method === "oauth_device_code" ||
			request.method === "oauth_prompt" ||
			request.method === "oauth_select" ||
			request.method === "oauth_manual_code"
		) {
			set({ activeDialog: request, modal: "dialog" });
			return;
		}
		if (request.method === "notify") {
			const toast: ToastItem = {
				id: request.id,
				message: typeof request.message === "string" ? request.message : "Notification",
				notifyType:
					request.notifyType === "warning" || request.notifyType === "error" ? request.notifyType : "info",
			};
			set((state) => ({ toasts: [...state.toasts.slice(-4), toast] }));
			return;
		}
		if (request.method === "setStatus") {
			set((state) => {
				const statusSegments = { ...state.statusSegments };
				if (typeof request.statusText === "string" && request.statusText.length > 0) {
					statusSegments[String(request.statusKey)] = request.statusText;
				} else {
					delete statusSegments[String(request.statusKey)];
				}
				return { statusSegments };
			});
			return;
		}
		if (request.method === "setWorking") {
			set((state) => ({
				workingLabel:
					request.resetMessage === true
						? "thinking"
						: typeof request.message === "string"
							? request.message
							: state.workingLabel,
				workingVisible: typeof request.visible === "boolean" ? request.visible : state.workingVisible,
				workingIndicatorFrames:
					request.resetIndicator === true
						? undefined
						: Array.isArray(request.frames)
							? request.frames.map(String)
							: state.workingIndicatorFrames,
				workingIndicatorIntervalMs:
					request.resetIndicator === true
						? undefined
						: typeof request.intervalMs === "number"
							? request.intervalMs
							: state.workingIndicatorIntervalMs,
			}));
			return;
		}
		if (request.method === "setHiddenThinkingLabel") {
			set({ hiddenThinkingLabel: typeof request.label === "string" ? request.label : "Thinking..." });
			return;
		}
		if (request.method === "setWidget") {
			set((state) => {
				const without = state.widgets.filter((widget) => widget.key !== String(request.widgetKey));
				if (!Array.isArray(request.widgetLines)) return { widgets: without };
				return {
					widgets: [
						...without,
						{
							key: String(request.widgetKey),
							lines: request.widgetLines.map(String),
							placement: request.widgetPlacement === "aboveEditor" ? "aboveEditor" : "belowEditor",
						},
					],
				};
			});
			return;
		}
		if (request.method === "setTitle" && typeof request.title === "string") {
			document.title = request.title;
			return;
		}
		if (request.method === "set_editor_text" && typeof request.text === "string") {
			set({ composerText: request.text });
			return;
		}
		if (
			request.method === "select" ||
			request.method === "confirm" ||
			request.method === "input" ||
			request.method === "editor"
		) {
			set({ activeDialog: request, modal: "dialog" });
		}
	},
	ingestEvent: (event) => {
		const type = event.type;
		if (type === "engine_keybindings_reloaded") {
			const state = event.state;
			if (
				typeof state !== "object" ||
				state === null ||
				!Array.isArray((state as { shortcuts?: unknown }).shortcuts)
			) {
				return;
			}
			const extensionShortcuts = (state as { shortcuts: unknown[] }).shortcuts
				.filter(
					(shortcut): shortcut is { key: string; description?: string } =>
						typeof shortcut === "object" &&
						shortcut !== null &&
						typeof (shortcut as { key?: unknown }).key === "string",
				)
				.map((shortcut) => ({
					key: shortcut.key,
					description: typeof shortcut.description === "string" ? shortcut.description : undefined,
				}));
			set({ extensionShortcuts });
			return;
		}
		if (type === "engine_input_form_open") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			const title = typeof event.title === "string" ? event.title : "Input";
			const fields = Array.isArray(event.fields)
				? event.fields
						.filter((field): field is Record<string, unknown> => typeof field === "object" && field !== null)
						.map((field) => ({
							name: String(field.name ?? "value"),
							type: String(field.type ?? "string"),
							initialValue: typeof field.initialValue === "string" ? field.initialValue : "",
							description: typeof field.description === "string" ? field.description : undefined,
							required: typeof field.required === "boolean" ? field.required : undefined,
							choices: Array.isArray(field.choices) ? field.choices.map(String) : undefined,
							placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
						}))
				: [];
			if (!componentId) return;
			set({
				inputForm: {
					componentId,
					title,
					fields,
					heading: typeof event.heading === "string" ? event.heading : undefined,
					submitLabel: typeof event.submitLabel === "string" ? event.submitLabel : undefined,
				},
				modal: "inputForm",
			});
			return;
		}
		if (type === "engine_input_form_close") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			const current = get().inputForm;
			if (current?.componentId === componentId) {
				set({ inputForm: undefined, modal: get().modal === "inputForm" ? "none" : get().modal });
			}
			return;
		}
		if (type === "engine_session_picker_open") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			set({
				hostSessionPicker: {
					componentId,
					sessions: parseHostSessionPickerRows(event.sessions),
					showRenameHint: event.showRenameHint === true,
				},
				modal: "hostSessionPicker",
			});
			return;
		}
		if (type === "engine_session_picker_update") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			set((state) => {
				if (state.hostSessionPicker?.componentId !== componentId) return state;
				return {
					hostSessionPicker: {
						...state.hostSessionPicker,
						sessions: parseHostSessionPickerRows(event.sessions),
						errorMessage: undefined,
					},
				};
			});
			return;
		}
		if (type === "engine_session_picker_error") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			const message = typeof event.message === "string" ? event.message : "Session picker error";
			if (!componentId) return;
			set((state) => {
				if (state.hostSessionPicker?.componentId !== componentId) return state;
				return { hostSessionPicker: { ...state.hostSessionPicker, errorMessage: message } };
			});
			return;
		}
		if (type === "engine_session_picker_close") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			set((state) => {
				if (state.hostSessionPicker?.componentId !== componentId) return state;
				return {
					hostSessionPicker: undefined,
					modal: state.modal === "hostSessionPicker" ? "none" : state.modal,
				};
			});
			return;
		}
		if (type === "engine_custom_open") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			const frame: CustomFrame = {
				componentId,
				overlay: event.overlay === true,
				chromeSlot:
					event.chromeSlot === "header" || event.chromeSlot === "footer" || event.chromeSlot === "editor"
						? event.chromeSlot
						: undefined,
				widgetKey: typeof event.widgetKey === "string" ? event.widgetKey : undefined,
				widgetPlacement: event.widgetPlacement === "aboveEditor" ? "aboveEditor" : "belowEditor",
				lines: [],
				appliedRequestId: 0,
				renderGeneration: 1,
				overlayOptions: parseOverlayOptions(event.overlayOptions),
				handlesCtrlC: event.handlesCtrlC === true,
				hidden: false,
				focused: event.overlay === true,
				mouseScrollTracking: false,
				terminalAutowrap: true,
			};
			set((state) => {
				const frames = [...state.frames.filter((item) => item.componentId !== componentId), frame];
				let widgets = state.widgets;
				if (frame.widgetKey) {
					widgets = [
						...state.widgets.filter((widget) => widget.key !== frame.widgetKey),
						{ key: frame.widgetKey, lines: [], placement: frame.widgetPlacement ?? "belowEditor" },
					];
				}
				return { frames, widgets };
			});
			return;
		}
		if (type === "engine_custom_frame") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			const lines = Array.isArray(event.lines) ? event.lines.map(String) : [];
			if (!componentId) return;
			const requestId = typeof event.requestId === "number" ? event.requestId : undefined;
			set((state) => {
				const renderedTool = state.entries.find((entry) => entry.remoteRenderId === componentId);
				if (renderedTool) {
					if (requestId !== undefined && requestId < (renderedTool.remoteRenderAppliedRequestId ?? 0)) {
						return state;
					}
					return {
						entries: state.entries.map((entry) =>
							entry.id === renderedTool.id
								? {
										...entry,
										remoteRenderLines: lines,
										remoteRenderAppliedRequestId: requestId ?? entry.remoteRenderAppliedRequestId ?? 0,
									}
								: entry,
						),
					};
				}
				const existing = state.frames.find((frame) => frame.componentId === componentId);
				if (existing && requestId !== undefined && requestId < existing.appliedRequestId) {
					return state;
				}
				const next: CustomFrame = {
					componentId,
					overlay: existing?.overlay ?? true,
					chromeSlot: existing?.chromeSlot,
					widgetKey: existing?.widgetKey,
					widgetPlacement: existing?.widgetPlacement,
					lines,
					requestId,
					appliedRequestId: requestId ?? existing?.appliedRequestId ?? 0,
					renderGeneration: existing?.renderGeneration ?? 0,
					overlayOptions: existing?.overlayOptions,
					handlesCtrlC: existing?.handlesCtrlC ?? false,
					hidden: existing?.hidden ?? false,
					focused: existing?.focused ?? true,
					mouseScrollTracking: existing?.mouseScrollTracking ?? false,
					terminalAutowrap: existing?.terminalAutowrap ?? true,
				};
				const frames = [...state.frames.filter((frame) => frame.componentId !== componentId), next];
				let widgets = state.widgets;
				if (next.widgetKey) {
					widgets = [
						...state.widgets.filter((widget) => widget.key !== next.widgetKey),
						{
							key: next.widgetKey,
							lines,
							placement: next.widgetPlacement ?? "belowEditor",
						},
					];
				}
				return { frames, widgets };
			});
			return;
		}
		if (type === "engine_custom_invalidate") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			set((state) => {
				const renderedTool = state.entries.find((entry) => entry.remoteRenderId === componentId);
				if (renderedTool) {
					return {
						entries: state.entries.map((entry) =>
							entry.id === renderedTool.id
								? { ...entry, remoteRenderGeneration: (entry.remoteRenderGeneration ?? 0) + 1 }
								: entry,
						),
					};
				}
				return {
					frames: state.frames.map((frame) =>
						frame.componentId === componentId
							? { ...frame, renderGeneration: frame.renderGeneration + 1 }
							: frame,
					),
				};
			});
			return;
		}
		if (type === "engine_custom_control") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			const action = event.action;
			if (!componentId || typeof action !== "string") return;
			set((state) => ({
				frames: state.frames.map((frame) => {
					if (frame.componentId !== componentId) {
						if (action === "focus") return { ...frame, focused: false };
						return frame;
					}
					if (action === "hide") return { ...frame, hidden: true, focused: false };
					if (action === "show") return { ...frame, hidden: false };
					if (action === "focus") return { ...frame, hidden: false, focused: true };
					if (action === "unfocus") return { ...frame, focused: false };
					return frame;
				}),
			}));
			return;
		}
		if (type === "engine_custom_terminal") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			const control = event.control;
			if (!componentId || typeof control !== "object" || control === null) return;
			const kind = (control as { kind?: unknown }).kind;
			const enabled = (control as { enabled?: unknown }).enabled === true;
			if (kind === "mouse-scroll-tracking") {
				set((state) => ({
					frames: state.frames.map((frame) =>
						frame.componentId === componentId ? { ...frame, mouseScrollTracking: enabled } : frame,
					),
				}));
				return;
			}
			if (kind === "autowrap") {
				set((state) => ({
					frames: state.frames.map((frame) =>
						frame.componentId === componentId ? { ...frame, terminalAutowrap: enabled } : frame,
					),
				}));
			}
			return;
		}
		if (type === "engine_custom_close" || type === "engine_custom_done") {
			const componentId = typeof event.componentId === "string" ? event.componentId : undefined;
			if (!componentId) return;
			set((state) => {
				const closing = state.frames.find((frame) => frame.componentId === componentId);
				return {
					frames: state.frames.filter((frame) => frame.componentId !== componentId),
					widgets: closing?.widgetKey
						? state.widgets.filter((widget) => widget.key !== closing.widgetKey)
						: state.widgets,
				};
			});
			return;
		}
		if (type === "agent_start" || type === "turn_start") {
			set({ working: true, workingLabel: "thinking" });
			return;
		}
		if (type === "agent_end" || type === "turn_end") {
			set({ working: false });
			return;
		}
		if (type === "bash_execution_start" || type === "user_bash_start") {
			const id = typeof event.id === "string" ? event.id : nextId("bash");
			const command = typeof event.command === "string" ? event.command : "";
			set((state) => ({
				working: true,
				workingLabel: "bash",
				entries: [
					...state.entries,
					{
						id,
						kind: "bash",
						bashCommand: command || undefined,
						text: command ? `$ ${command}\n` : "",
						streaming: true,
						expanded: true,
						excludeFromContext: event.excludeFromContext === true,
					},
				],
			}));
			return;
		}
		if (type === "bash_execution_update") {
			const id = typeof event.id === "string" ? event.id : undefined;
			const delta = typeof event.delta === "string" ? event.delta : "";
			if (!id || !delta) return;
			set((state) => {
				const existing = state.entries.find((entry) => entry.id === id);
				if (existing) {
					return {
						entries: state.entries.map((entry) =>
							entry.id === id ? { ...entry, text: `${entry.text}${delta}`, streaming: true } : entry,
						),
					};
				}
				return {
					working: true,
					workingLabel: "bash",
					entries: [...state.entries, { id, kind: "bash", text: delta, streaming: true, expanded: true }],
				};
			});
			return;
		}
		if (type === "bash_execution_end" || type === "user_bash_end") {
			const id = typeof event.id === "string" ? event.id : undefined;
			if (!id) return;
			set((state) => {
				const result = event;
				return {
					working: false,
					entries: state.entries.map((entry) => {
						if (entry.id !== id) return entry;
						return {
							...entry,
							streaming: false,
							text:
								typeof result.output === "string"
									? `${entry.bashCommand ? `$ ${entry.bashCommand}\n` : ""}${result.output}`
									: entry.text,
							bashExitCode: typeof result.exitCode === "number" ? result.exitCode : entry.bashExitCode,
							bashCancelled: result.cancelled === true,
							bashTruncated: result.truncated === true,
							bashFullOutputPath:
								typeof result.fullOutputPath === "string" ? result.fullOutputPath : entry.bashFullOutputPath,
						};
					}),
				};
			});
			return;
		}
		if (type === "message_start") {
			const message = event.message as Record<string, unknown> | undefined;
			const id =
				typeof event.messageId === "string"
					? event.messageId
					: typeof message?.id === "string"
						? message.id
						: nextId("message");
			if (!message) return;
			const entry = transcriptEntryFromMessage(id, message, true);
			if (!entry) return;
			const entryId = entry.kind === "tool" && entry.toolCallId ? entry.toolCallId : id;
			set((state) => {
				const existing = state.entries.find((item) => item.id === entryId);
				return {
					working: entry.kind !== "user" && entry.kind !== "skill",
					entries: [
						...state.entries.filter((item) => item.id !== entryId),
						{
							...existing,
							...entry,
							id: entryId,
							toolName: entry.toolName ?? existing?.toolName,
							toolCallId: entry.toolCallId ?? existing?.toolCallId,
							toolArgs: existing?.toolArgs ?? entry.toolArgs,
							remoteRenderId: existing?.remoteRenderId ?? entry.remoteRenderId,
							remoteRenderLines: existing?.remoteRenderLines,
							remoteRenderGeneration: existing?.remoteRenderGeneration ?? entry.remoteRenderGeneration,
							remoteRenderAppliedRequestId: existing?.remoteRenderAppliedRequestId,
							text: entry.text || existing?.text || "",
							expanded: existing?.expanded ?? entry.expanded,
							toolResult: entry.role === "toolResult" ? message : existing?.toolResult,
						},
					],
				};
			});
			return;
		}
		if (type === "message_update") {
			const message = event.message as
				| { role?: string; content?: unknown; id?: string; toolCallId?: string }
				| undefined;
			const assistantMessageEvent = event.assistantMessageEvent as
				| { type?: string; delta?: string; error?: unknown }
				| undefined;
			if (message?.role === "toolResult" && typeof message.toolCallId === "string") {
				set((state) => ({
					entries: state.entries.map((entry) =>
						entry.id === message.toolCallId
							? {
									...entry,
									text: textFromContent(message.content) || entry.text,
									toolResult: message,
									streaming: true,
									remoteRenderGeneration: (entry.remoteRenderGeneration ?? 0) + 1,
								}
							: entry,
					),
				}));
				return;
			}
			set((state) => {
				const id =
					(typeof message?.id === "string" && message.id) ||
					state.entries.find((entry) => entry.streaming && entry.kind === "assistant")?.id ||
					nextId("assistant");
				const existing = state.entries.find((entry) => entry.id === id);
				let text = existing?.text ?? textFromContent(message?.content);
				let thinking = existing?.thinking ?? thinkingFromContent(message?.content);
				if (assistantMessageEvent?.type === "text_delta" && typeof assistantMessageEvent.delta === "string")
					text = `${text}${assistantMessageEvent.delta}`;
				if (assistantMessageEvent?.type === "thinking_delta" && typeof assistantMessageEvent.delta === "string")
					thinking = `${thinking ?? ""}${assistantMessageEvent.delta}`;
				if (!assistantMessageEvent && message?.content !== undefined) {
					text = textFromContent(message.content);
					thinking = thinkingFromContent(message.content);
				}
				const error =
					typeof assistantMessageEvent?.error === "string" ? assistantMessageEvent.error : existing?.error;
				const streaming = assistantMessageEvent?.type !== "done" && assistantMessageEvent?.type !== "error";
				const nextEntry: TranscriptEntry = {
					id,
					kind: "assistant",
					role: message?.role ?? "assistant",
					text,
					thinking,
					streaming,
					expanded: existing?.expanded ?? false,
					error,
				};
				return {
					working: streaming,
					workingLabel: "streaming",
					entries: [...state.entries.filter((entry) => entry.id !== id), nextEntry],
				};
			});
			return;
		}
		if (type === "message_end") {
			const message = event.message as Record<string, unknown> | undefined;
			if (!message) return;
			set((state) => {
				const role = typeof message.role === "string" ? message.role : "system";
				const baseId =
					(typeof message.id === "string" && message.id) ||
					state.entries.find((entry) => entry.streaming && entry.role === role)?.id ||
					nextId("message");
				const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : undefined;
				const id = role === "toolResult" && toolCallId ? toolCallId : baseId;
				const existing = state.entries.find((entry) => entry.id === id);
				const nextEntry = transcriptEntryFromMessage(id, message, false);
				if (!nextEntry) return state;
				return {
					entries: [
						...state.entries.filter((entry) => entry.id !== id),
						{
							...existing,
							...nextEntry,
							text: nextEntry.text || existing?.text || "",
							thinking: nextEntry.thinking ?? existing?.thinking,
							expanded: existing?.expanded ?? nextEntry.expanded,
							toolName: nextEntry.toolName ?? existing?.toolName,
							toolCallId: nextEntry.toolCallId ?? existing?.toolCallId,
							toolArgs: existing?.toolArgs ?? nextEntry.toolArgs,
							remoteRenderId: existing?.remoteRenderId ?? nextEntry.remoteRenderId,
							remoteRenderLines: existing?.remoteRenderLines,
							remoteRenderGeneration: existing?.remoteRenderGeneration ?? nextEntry.remoteRenderGeneration,
							remoteRenderAppliedRequestId: existing?.remoteRenderAppliedRequestId,
							toolResult: role === "toolResult" ? message : existing?.toolResult,
						},
					],
				};
			});
			return;
		}
		if (type === "tool_execution_start") {
			const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : nextId("tool");
			const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
			set((state) => {
				const existing = state.entries.find((entry) => entry.id === toolCallId);
				const nextEntry: TranscriptEntry = {
					id: toolCallId,
					kind: "tool",
					toolName,
					toolCallId,
					remoteRenderId: `gui-tool-render:${toolCallId}`,
					toolArgs: event.args,
					text: typeof event.args === "object" ? JSON.stringify(event.args, null, 2) : String(event.args ?? ""),
					streaming: true,
					expanded: existing?.expanded ?? false,
					remoteRenderGeneration: (existing?.remoteRenderGeneration ?? 0) + 1,
					remoteRenderAppliedRequestId: existing?.remoteRenderAppliedRequestId,
					remoteRenderLines: existing?.remoteRenderLines,
				};
				return {
					working: true,
					workingLabel: toolName,
					entries: [...state.entries.filter((entry) => entry.id !== toolCallId), nextEntry],
				};
			});
			return;
		}
		if (type === "tool_execution_end" || type === "tool_execution_update") {
			const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;
			if (!toolCallId) return;
			set((state) => ({
				working: type !== "tool_execution_end",
				entries: state.entries.map((entry) =>
					entry.id === toolCallId
						? {
								...entry,
								toolArgs: event.args ?? entry.toolArgs,
								toolResult: type === "tool_execution_update" ? event.partialResult : event.result,
								text:
									typeof (type === "tool_execution_update" ? event.partialResult : event.result) === "object"
										? JSON.stringify(
												type === "tool_execution_update" ? event.partialResult : event.result,
												null,
												2,
											)
										: String(
												(type === "tool_execution_update" ? event.partialResult : event.result) ??
													entry.text,
											),
								streaming: type !== "tool_execution_end",
								remoteRenderGeneration: (entry.remoteRenderGeneration ?? 0) + 1,
								error: typeof event.isError === "boolean" && event.isError ? "Tool error" : undefined,
							}
						: entry,
				),
			}));
			return;
		}
		if (type === "queue_update") {
			const items = Array.isArray(event.queue) ? event.queue : [];
			const queue: QueueChip[] = items
				.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
				.map((item, index) => ({
					id: typeof item.id === "string" ? item.id : `queue-${index}`,
					text: typeof item.message === "string" ? item.message : String(item.text ?? ""),
					behavior: item.streamingBehavior === "followUp" ? "followUp" : "steer",
				}));
			set({ queue });
			return;
		}
		if (type === "entry_appended") {
			const entry = event.entry;
			if (typeof entry !== "object" || entry === null) return;
			const value = entry as Record<string, unknown>;
			if (value.type !== "custom" || typeof value.id !== "string") return;
			const entryId = value.id;
			set((state) => ({
				entries: [
					...state.entries.filter((item) => item.id !== entryId),
					{
						id: entryId,
						kind: "custom",
						customType: typeof value.customType === "string" ? value.customType : "custom",
						text: stringify(value.data),
						streaming: false,
						expanded: false,
					},
				],
			}));
			return;
		}
		if (type === "auto_compaction_end" || type === "compaction_end") {
			const result = event.result;
			const summary =
				typeof result === "object" &&
				result !== null &&
				typeof (result as { compactedText?: unknown }).compactedText === "string"
					? (result as { compactedText: string }).compactedText
					: undefined;
			if (summary) {
				set((state) => ({
					entries: [
						...state.entries,
						{ id: nextId("compaction"), kind: "compaction", text: summary, streaming: false, expanded: false },
					],
				}));
			} else {
				set((state) => ({
					entries: [
						...state.entries,
						{
							id: nextId("compaction"),
							kind: "compaction",
							text: event.aborted === true ? "Context compaction aborted" : "Context compaction failed",
							streaming: false,
							expanded: false,
							error: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
						},
					],
				}));
			}
			return;
		}
		if (type === "session_stats" || type === "usage_update") {
			const tokens = event.tokens as
				| { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
				| undefined;
			set({
				usageLabel: formatUsage(
					tokens,
					typeof event.cost === "number" ? event.cost : undefined,
					typeof event.contextPercent === "number" ? event.contextPercent : null,
				),
			});
		}
	},
}));

export { formatUsage };
