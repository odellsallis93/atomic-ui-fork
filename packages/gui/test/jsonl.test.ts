import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "vitest";
import {
	attachJsonlLineReader,
	INTERACTIVE_ENGINE_PROTOCOL_VERSION,
	isEngineMessage,
	isRpcEvent,
	isRpcResponse,
	parseEngineReady,
	serializeJsonLine,
} from "../src/main/jsonl.ts";

test("serializeJsonLine emits LF-delimited JSON", () => {
	assert.equal(serializeJsonLine({ type: "prompt", message: "hi" }), '{"type":"prompt","message":"hi"}\n');
});

test("parseEngineReady accepts protocol v3 frames and GUI host identity", () => {
	const ready = parseEngineReady(
		JSON.stringify({
			type: "engine_ready",
			protocolVersion: INTERACTIVE_ENGINE_PROTOCOL_VERSION,
			pid: 42,
			hostInfo: { kind: "gui" },
		}),
	);
	assert.deepEqual(ready, { protocolVersion: 3, pid: 42, hostInfo: { kind: "gui" } });
	assert.equal(parseEngineReady('{"type":"message_start"}'), undefined);
});

test("attachJsonlLineReader splits only on LF and strips CR", async () => {
	const lines: string[] = [];
	const stream = Readable.from([Buffer.from('{"a":1}\r\n{"b":2}\n')]);
	attachJsonlLineReader(stream, (line) => lines.push(line));
	await new Promise((resolve) => stream.on("end", resolve));
	assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
});

test("response and event discriminators", () => {
	assert.equal(isRpcResponse({ type: "response", command: "prompt", success: true }), true);
	assert.equal(isRpcEvent({ type: "message_update" }), true);
	assert.equal(isRpcEvent({ type: "engine_heartbeat" }), false);
	assert.equal(isEngineMessage({ type: "engine_custom_frame", componentId: "c1", lines: [] }), true);
	assert.equal(isEngineMessage({ type: "engine_ready" }), false);
	assert.equal(isRpcEvent({ type: "response", success: true }), false);
});
