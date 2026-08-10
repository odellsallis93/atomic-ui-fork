import { useEffect, useRef } from "react";
import { clearFrameRenderRequestId, nextFrameRenderRequestId } from "../helpers/frame-render-ids";
import { defaultRenderGrid } from "../helpers/overlay-geometry";
import type { TranscriptEntry } from "../store/session-store";

type JsonValue = boolean | JsonObject | JsonValue[] | null | number | string;
interface JsonObject {
	[key: string]: JsonValue;
}

function asJsonValue(value: unknown): JsonValue {
	if (value === undefined) return null;
	try {
		const encoded = JSON.stringify(value);
		return encoded === undefined ? null : (JSON.parse(encoded) as JsonValue);
	} catch {
		return null;
	}
}

function asJsonObject(value: unknown): JsonObject | undefined {
	const encoded = asJsonValue(value);
	return typeof encoded === "object" && encoded !== null && !Array.isArray(encoded) ? encoded : undefined;
}

function toolRenderSignature(entries: TranscriptEntry[]): string {
	return entries
		.filter((entry) => entry.remoteRenderId)
		.map(
			(entry) =>
				`${entry.remoteRenderId}:${entry.remoteRenderGeneration ?? 0}:${entry.expanded ? 1 : 0}:${entry.streaming ? 1 : 0}`,
		)
		.join("|");
}

/**
 * Requests engine-owned ToolExecutionComponent frames for live tool entries.
 * A dedicated host keeps these frames inside the transcript instead of letting
 * them fall through to the generic extension-overlay handler.
 */
export function ToolRenderHost(props: {
	entries: TranscriptEntry[];
	onRender: (command: {
		type: "engine_tool_render";
		componentId: string;
		requestId: number;
		width: number;
		toolName: string;
		toolCallId: string;
		args: JsonValue;
		result?: JsonObject;
		executionStarted: boolean;
		argsComplete: boolean;
		isPartial: boolean;
		expanded: boolean;
		showImages: boolean;
		imageWidthCells: number;
	}) => void;
	onDispose: (componentId: string) => void;
}) {
	const { entries, onRender, onDispose } = props;
	const knownIds = useRef(new Set<string>());
	const entriesRef = useRef(entries);
	const onRenderRef = useRef(onRender);
	const onDisposeRef = useRef(onDispose);
	entriesRef.current = entries;
	onRenderRef.current = onRender;
	onDisposeRef.current = onDispose;
	const signature = toolRenderSignature(entries);

	useEffect(() => {
		const current = signature ? entriesRef.current.filter((entry) => entry.remoteRenderId) : [];
		const liveIds = new Set(current.flatMap((entry) => (entry.remoteRenderId ? [entry.remoteRenderId] : [])));
		for (const entry of current) {
			if (!entry.remoteRenderId || !entry.toolName || !entry.toolCallId) continue;
			const grid = defaultRenderGrid({
				widthPx: window.innerWidth * 0.94,
				heightPx: window.innerHeight * 0.25,
			});
			onRenderRef.current({
				type: "engine_tool_render",
				componentId: entry.remoteRenderId,
				requestId: nextFrameRenderRequestId(entry.remoteRenderId),
				width: grid.width,
				toolName: entry.toolName,
				toolCallId: entry.toolCallId,
				args: asJsonValue(entry.toolArgs),
				result: asJsonObject(entry.toolResult),
				executionStarted: true,
				argsComplete: true,
				isPartial: entry.streaming,
				expanded: entry.expanded,
				showImages: false,
				imageWidthCells: 60,
			});
		}
		for (const componentId of knownIds.current) {
			if (liveIds.has(componentId)) continue;
			clearFrameRenderRequestId(componentId);
			onDisposeRef.current(componentId);
		}
		knownIds.current = liveIds;
	}, [signature]);

	useEffect(
		() => () => {
			for (const componentId of knownIds.current) {
				clearFrameRenderRequestId(componentId);
				onDisposeRef.current(componentId);
			}
		},
		[],
	);

	return null;
}
