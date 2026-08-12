import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import type { AgentSession } from "../../packages/coding-agent/src/core/agent-session.ts";
import type { AutocompleteProviderFactory } from "../../packages/coding-agent/src/core/extensions/ui-types.ts";
import { RpcAutocompleteService } from "../../packages/coding-agent/src/modes/rpc/rpc-autocomplete.ts";

function createSession(cwd = process.cwd()): AgentSession {
	return {
		promptTemplates: [],
		extensionRunner: { getRegisteredCommands: () => [] },
		resourceLoader: { getSkills: () => ({ skills: [] }) },
		sessionManager: { getCwd: () => cwd },
	} as unknown as AgentSession;
}

test("engine autocomplete retains the TUI @-mention path fallback", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "atomic-rpc-autocomplete-"));
	try {
		writeFileSync(join(cwd, "mention-fixture.md"), "fixture");
		const service = new RpcAutocompleteService(createSession(cwd));
		const result = await service.query("composer", "@mention-fixture", "@mention-fixture".length);

		assert.ok(result.suggestions.some((suggestion) => suggestion.value === "@mention-fixture.md"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("engine autocomplete applies extension provider wrappers before serializing a completion", async () => {
	const service = new RpcAutocompleteService(createSession());
	const wrapper: AutocompleteProviderFactory = (current) => ({
		...current,
		getSuggestions: async (lines, cursorLine, cursorCol, options) => {
			assert.deepEqual(lines, ["/wrapped"]);
			assert.equal(cursorLine, 0);
			assert.equal(cursorCol, 8);
			assert.equal(options.force, false);
			return { prefix: "/wrapped", items: [{ value: "wrapped-value", label: "Wrapped", description: "extension" }] };
		},
		applyCompletion: () => ({ lines: ["extension result"], cursorLine: 0, cursorCol: 9 }),
	});
	service.addWrapper(wrapper);

	assert.deepEqual(await service.query("composer", "/wrapped", 8), {
		suggestions: [
			{
				value: "wrapped-value",
				label: "Wrapped",
				description: "extension",
				text: "extension result",
				cursorOffset: 9,
			},
		],
	});
});

test("a newer composer query cancels the prior engine provider call", async () => {
	const service = new RpcAutocompleteService(createSession());
	let calls = 0;
	service.addWrapper((current) => ({
		...current,
		getSuggestions: async (_lines, _cursorLine, _cursorCol, { signal }) => {
			calls += 1;
			if (calls === 1) {
				return await new Promise<null>((resolve) =>
					signal.addEventListener("abort", () => resolve(null), { once: true }),
				);
			}
			return { prefix: "/", items: [{ value: "second", label: "Second" }] };
		},
		applyCompletion: (_lines, _cursorLine, _cursorCol) => ({ lines: ["/second "], cursorLine: 0, cursorCol: 8 }),
	}));

	const first = service.query("composer", "/first", 6);
	const second = service.query("composer", "/second", 7);
	assert.deepEqual(await first, { suggestions: [] });
	assert.deepEqual(await second, {
		suggestions: [{ value: "second", label: "Second", text: "/second ", cursorOffset: 8 }],
	});
});
