import { create } from "zustand";
import type { EngineStatus, GuiRpcEvent } from "../../../shared/ipc.ts";

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
	error?: string;
}

export interface QueueChip {
	id: string;
	text: string;
	behavior: "steer" | "followUp";
}

export interface SessionState {
	status: EngineStatus;
	entries: TranscriptEntry[];
	working: boolean;
	workingLabel: string;
	rawLines: string[];
	showRawLog: boolean;
	queue: QueueChip[];
	composerText: string;
	errorBanner?: string;
	usageLabel: string;
	setStatus: (status: EngineStatus) => void;
	setComposerText: (text: string) => void;
	toggleRawLog: () => void;
	appendRawLine: (line: string) => void;
	ingestEvent: (event: GuiRpcEvent) => void;
	resetTranscript: () => void;
	setErrorBanner: (message: string | undefined) => void;
	toggleEntryExpanded: (id: string) => void;
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

export const useSessionStore = create<SessionState>((set, get) => ({
	status: { state: "idle" },
	entries: [],
	working: false,
	workingLabel: "thinking",
	rawLines: [],
	showRawLog: false,
	queue: [],
	composerText: "",
	usageLabel: "—",
	setStatus: (status) => set({ status, errorBanner: status.error }),
	setComposerText: (text) => set({ composerText: text }),
	toggleRawLog: () => set({ showRawLog: !get().showRawLog }),
	appendRawLine: (line) =>
		set((state) => ({
			rawLines: [...state.rawLines.slice(-400), line],
		})),
	resetTranscript: () => set({ entries: [], queue: [], working: false }),
	setErrorBanner: (message) => set({ errorBanner: message }),
	toggleEntryExpanded: (id) =>
		set((state) => ({
			entries: state.entries.map((entry) => (entry.id === id ? { ...entry, expanded: !entry.expanded } : entry)),
		})),
	ingestEvent: (event) => {
		const type = event.type;
		if (type === "agent_start" || type === "turn_start") {
			set({ working: true, workingLabel: "thinking" });
			return;
		}
		if (type === "agent_end" || type === "turn_end") {
			set({ working: false });
			return;
		}
		if (type === "message_start") {
			const message = event.message as { role?: string; content?: unknown } | undefined;
			const role = message?.role ?? "assistant";
			const kind: EntryKind = role === "user" ? "user" : role === "toolResult" ? "tool" : "assistant";
			const id =
				typeof event.messageId === "string"
					? event.messageId
					: typeof (message as { id?: string } | undefined)?.id === "string"
						? (message as { id: string }).id
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
	},
}));
