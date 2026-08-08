import type { Readable } from "node:stream";

export function serializeJsonLine(value: object): string {
	return `${JSON.stringify(value)}\n`;
}

/**
 * Strict LF-only JSONL reader (Node readline is not protocol-safe — it also
 * splits on U+2028/U+2029). Matches coding-agent's rpc/jsonl framing.
 */
export function attachJsonlLineReader(stream: Readable, onLine: (line: string) => void): () => void {
	let buffer = Buffer.alloc(0);
	const onData = (chunk: Buffer): void => {
		buffer = Buffer.concat([buffer, chunk]);
		while (true) {
			const newline = buffer.indexOf(0x0a);
			if (newline === -1) break;
			let frame = buffer.subarray(0, newline);
			buffer = buffer.subarray(newline + 1);
			if (frame.at(-1) === 0x0d) frame = frame.subarray(0, -1);
			onLine(frame.toString("utf8"));
		}
	};
	stream.on("data", onData);
	return () => {
		stream.off("data", onData);
	};
}

export const INTERACTIVE_ENGINE_PROTOCOL_VERSION = 2;

export function parseEngineReady(line: string): { protocolVersion: number; pid: number } | undefined {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return undefined;
	}
	if (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		(value as { type: unknown }).type === "engine_ready" &&
		"protocolVersion" in value &&
		"pid" in value &&
		typeof (value as { protocolVersion: unknown }).protocolVersion === "number" &&
		typeof (value as { pid: unknown }).pid === "number"
	) {
		return {
			protocolVersion: (value as { protocolVersion: number }).protocolVersion,
			pid: (value as { pid: number }).pid,
		};
	}
	return undefined;
}

export interface RpcResponseMessage {
	id?: string;
	type: "response";
	command: string;
	success: boolean;
	error?: string;
	data?: unknown;
}

export function isRpcResponse(value: unknown): value is RpcResponseMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		(value as { type: unknown }).type === "response" &&
		"success" in value &&
		typeof (value as { success: unknown }).success === "boolean"
	);
}

export function isExtensionUiRequest(
	value: unknown,
): value is { type: "extension_ui_request"; id: string; method: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		(value as { type: unknown }).type === "extension_ui_request" &&
		"id" in value &&
		typeof (value as { id: unknown }).id === "string" &&
		"method" in value &&
		typeof (value as { method: unknown }).method === "string"
	);
}

export function isEngineMessage(value: unknown): value is { type: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof (value as { type: unknown }).type === "string" &&
		(value as { type: string }).type.startsWith("engine_") &&
		(value as { type: string }).type !== "engine_ready"
	);
}

export function isRpcEvent(value: unknown): value is { type: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof (value as { type: unknown }).type === "string" &&
		(value as { type: string }).type !== "response" &&
		(value as { type: string }).type !== "extension_ui_request" &&
		!(value as { type: string }).type.startsWith("engine_")
	);
}
