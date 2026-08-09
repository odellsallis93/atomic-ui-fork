import { create } from "zustand";
import type {
	AuthCatalog,
	EngineStatus,
	ExtensionUiRequest,
	GuiRpcEvent,
	InputFormRequest,
	ModelInfo,
	SessionListItem,
	HostSessionPickerRow,
	HostSessionPickerState,
	SessionTreeNodeInfo,
	SlashCommandInfo,
	ThemeSummary,
	TrustOption,
	TrustStatus,
} from "../../../shared/ipc.ts";
import { parseOverlayOptions, type GuiOverlayOptions } from "../../../shared/overlay-options.ts";

export type EntryKind = "user" | "assistant" | "tool" | "bash" | "system" | "compaction" | "branchSummary" | "raw";

export interface TranscriptEntry {
	id: string;
	kind: EntryKind;
	role?: string;
	text: string;
	thinking?: string;
	toolName?: string;
	toolCallId?: string;
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
	rawLines: string[];
	showRawLog: boolean;
	hideThinking: boolean;
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
	models: ModelInfo[];
	sessions: SessionListItem[];
	treeNodes: SessionTreeNodeInfo[];
	treeLeafId: string | null;
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
	setErrorBanner: (message: string | undefined) => void;
	toggleEntryExpanded: (id: string) => void;
	setCommands: (commands: SlashCommandInfo[]) => void;
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
			const typed = block as { type: string; text?: string; thinking?: string };
			if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
			if (typed.type === "thinking" && typeof typed.thinking === "string") parts.push(typed.thinking);
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
	rawLines: [],
	showRawLog: false,
	hideThinking: false,
	queue: [],
	composerText: "",
	promptHistory: [],
	historyIndex: -1,
	usageLabel: "—",
	statusSegments: {},
	widgets: [],
	toasts: [],
	commands: [],
	models: [],
	sessions: [],
	treeNodes: [],
	treeLeafId: null,
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
	resetTranscript: () => set({ entries: [], queue: [], working: false, frames: [] }),
	setErrorBanner: (message) => set({ errorBanner: message }),
	toggleEntryExpanded: (id) =>
		set((state) => ({
			entries: state.entries.map((entry) => (entry.id === id ? { ...entry, expanded: !entry.expanded } : entry)),
		})),
	setCommands: (commands) => set({ commands }),
	setModels: (models) => set({ models }),
	setSessions: (sessions) => set({ sessions }),
	setTree: (nodes, leafId) => set({ treeNodes: nodes, treeLeafId: leafId }),
	setThemes: (themes) => set({ themes }),
	setThemeName: (name) => set({ themeName: name }),
	setAuthCatalog: (catalog) => set({ authCatalog: catalog }),
	setAuthBusyProvider: (provider) => set({ authBusyProvider: provider }),
	setTrust: (status, options) => set({ trustStatus: status, trustOptions: options }),
	clearInputForm: () =>
		set({ inputForm: undefined, modal: get().modal === "inputForm" ? "none" : get().modal }),
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
				const existing = state.frames.find((frame) => frame.componentId === componentId);
				if (existing && requestId !== undefined && requestId < existing.appliedRequestId) {
					return state;
				}
				const next: CustomFrame = {
					componentId,
					overlay: existing?.overlay ?? true,
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
			set((state) => ({
				frames: state.frames.map((frame) =>
					frame.componentId === componentId
						? { ...frame, renderGeneration: frame.renderGeneration + 1 }
						: frame,
				),
			}));
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
			set((state) => ({
				entries: state.entries.map((entry) =>
					entry.id === id ? { ...entry, text: `${entry.text}${delta}`, streaming: true } : entry,
				),
			}));
			return;
		}
		if (type === "bash_execution_end" || type === "user_bash_end") {
			const id = typeof event.id === "string" ? event.id : undefined;
			if (!id) return;
			set((state) => ({
				working: false,
				entries: state.entries.map((entry) => (entry.id === id ? { ...entry, streaming: false } : entry)),
			}));
			return;
		}
		if (type === "message_start") {
			const message = event.message as { role?: string; content?: unknown; id?: string } | undefined;
			const role = message?.role ?? "assistant";
			const kind: EntryKind = role === "user" ? "user" : role === "toolResult" ? "tool" : "assistant";
			const id =
				typeof event.messageId === "string"
					? event.messageId
					: typeof message?.id === "string"
						? message.id
						: nextId(kind);
			set((state) => ({
				working: role !== "user",
				entries: [
					...state.entries.filter((entry) => entry.id !== id),
					{
						id,
						kind,
						role,
						text: textFromContent(message?.content),
						thinking: thinkingFromContent(message?.content),
						streaming: true,
						expanded: false,
					},
				],
			}));
			return;
		}
		if (type === "message_update") {
			const message = event.message as { role?: string; content?: unknown; id?: string } | undefined;
			const assistantMessageEvent = event.assistantMessageEvent as
				| { type?: string; delta?: string; contentIndex?: number }
				| undefined;
			set((state) => {
				const id =
					(typeof message?.id === "string" && message.id) ||
					state.entries.find((entry) => entry.streaming && entry.kind === "assistant")?.id ||
					nextId("assistant");
				const existing = state.entries.find((entry) => entry.id === id);
				let text = existing?.text ?? textFromContent(message?.content);
				let thinking = existing?.thinking ?? thinkingFromContent(message?.content);
				if (assistantMessageEvent?.type === "text_delta" && typeof assistantMessageEvent.delta === "string") {
					text = `${text}${assistantMessageEvent.delta}`;
				}
				if (assistantMessageEvent?.type === "thinking_delta" && typeof assistantMessageEvent.delta === "string") {
					thinking = `${thinking ?? ""}${assistantMessageEvent.delta}`;
				}
				if (!assistantMessageEvent && message?.content !== undefined) {
					text = textFromContent(message.content);
					thinking = thinkingFromContent(message.content);
				}
				const nextEntry: TranscriptEntry = {
					id,
					kind: "assistant",
					role: message?.role ?? "assistant",
					text,
					thinking,
					streaming: true,
					expanded: existing?.expanded ?? false,
				};
				const without = state.entries.filter((entry) => entry.id !== id);
				return { working: true, workingLabel: "streaming", entries: [...without, nextEntry] };
			});
			return;
		}
		if (type === "message_end") {
			const message = event.message as { role?: string; content?: unknown; id?: string } | undefined;
			set((state) => {
				const id =
					(typeof message?.id === "string" && message.id) ||
					state.entries.find((entry) => entry.streaming)?.id ||
					nextId("assistant");
				const existing = state.entries.find((entry) => entry.id === id);
				const nextEntry: TranscriptEntry = {
					id,
					kind: message?.role === "user" ? "user" : "assistant",
					role: message?.role,
					text: textFromContent(message?.content) || existing?.text || "",
					thinking: thinkingFromContent(message?.content) ?? existing?.thinking,
					streaming: false,
					expanded: existing?.expanded ?? false,
				};
				return {
					entries: [...state.entries.filter((entry) => entry.id !== id), nextEntry],
				};
			});
			return;
		}
		if (type === "tool_execution_start") {
			const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : nextId("tool");
			const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
			set((state) => ({
				working: true,
				workingLabel: toolName,
				entries: [
					...state.entries,
					{
						id: toolCallId,
						kind: "tool",
						toolName,
						toolCallId,
						text: typeof event.args === "object" ? JSON.stringify(event.args, null, 2) : String(event.args ?? ""),
						streaming: true,
						expanded: false,
					},
				],
			}));
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
								text:
									typeof event.result === "object"
										? JSON.stringify(event.result, null, 2)
										: String(event.result ?? entry.text),
								streaming: type !== "tool_execution_end",
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
		if (type === "auto_compaction_end" || type === "compaction_end") {
			set((state) => ({
				entries: [
					...state.entries,
					{
						id: nextId("compaction"),
						kind: "compaction",
						text: "Context compacted",
						streaming: false,
						expanded: false,
					},
				],
			}));
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
