import assert from "node:assert/strict";
import { test } from "vitest";
import { RpcTerminalInputService } from "../../packages/coding-agent/src/modes/rpc/rpc-terminal-input.ts";

test("terminal interception applies registered handlers in order and carries transformed input forward", () => {
	const service = new RpcTerminalInputService();
	const seen: string[] = [];
	service.add((data) => {
		seen.push(`first:${data}`);
		return { data: `${data}!` };
	});
	service.add((data) => {
		seen.push(`second:${data}`);
		return { data: data.toUpperCase() };
	});
	assert.deepEqual(service.intercept("go"), { consumed: false, data: "GO!" });
	assert.deepEqual(seen, ["first:go", "second:go!"]);
});

test("terminal interception stops at the first consuming handler", () => {
	const service = new RpcTerminalInputService();
	let reached = false;
	service.add(() => ({ consume: true }));
	service.add(() => {
		reached = true;
		return undefined;
	});
	assert.deepEqual(service.intercept("\u001b"), { consumed: true });
	assert.equal(reached, false);
});
