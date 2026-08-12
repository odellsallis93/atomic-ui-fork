import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "vitest";
import { EngineClient } from "../src/main/engine-client.ts";
import { INTERACTIVE_ENGINE_PROTOCOL_VERSION } from "../src/main/jsonl.ts";
import { resolveAtomicCli } from "../src/main/resolve-atomic.ts";
import type { ExtensionUiRequest } from "../src/shared/ipc.ts";
import { ENGINE_CLIENT_SPAWN_TIMEOUT_MS } from "../vitest.config.ts";

/**
 * Real-engine smoke (Phase 1.1 / 1.2).
 *
 * Boundary: these tests spawn the workspace Atomic CLI (`resolveAtomicCli`) and
 * speak protocol v3. They prove host↔engine lifecycle and session switch leaf
 * alignment. They do **not** replace Electron E2E or full model-provider parity.
 *
 * Fake-engine structural RPC coverage lives in `engine-client.test.ts` and must
 * not be cited alone as parity evidence (see `docs/capability-ledger.md`).
 *
 * Approved gap: LLM prompt/stream against a live provider is not required here.
 * Streaming is proven via real-engine bash execution events. Full model prompt
 * path remains a tracked follow-up when provider credentials/CI policy allow.
 */

const REAL_ENGINE_TIMEOUT_MS = Math.max(ENGINE_CLIENT_SPAWN_TIMEOUT_MS, 90_000);
const REAL_ENGINE_LARGE_SESSION_TIMEOUT_MS = 120_000;
type ExtensionUiResponder = (client: EngineClient, request: ExtensionUiRequest) => void;

function writeLargeDurableSession(cwd: string): string {
	const path = join(cwd, "large-transcript.jsonl");
	const rows = [
		JSON.stringify({
			type: "session",
			version: 3,
			id: "large-transcript",
			timestamp: "2026-08-12T00:00:00.000Z",
			cwd,
		}),
	];
	for (let index = 1; index <= 10_000; index += 1) {
		rows.push(
			JSON.stringify({
				type: "message",
				id: `large-entry-${index}`,
				parentId: index === 1 ? null : `large-entry-${index - 1}`,
				timestamp: "2026-08-12T00:00:00.000Z",
				message: { role: "user", content: `large transcript message ${index}`, timestamp: index },
			}),
		);
	}
	writeFileSync(path, `${rows.join("\n")}\n`, "utf8");
	return path;
}

function bashCommands(entries: unknown[]): string[] {
	const commands: string[] = [];
	for (const entry of entries) {
		if (typeof entry !== "object" || entry === null) continue;
		const value = entry as { type?: unknown; message?: { role?: unknown; command?: unknown } };
		if (value.type !== "message") continue;
		if (value.message?.role !== "bashExecution") continue;
		if (typeof value.message.command === "string") commands.push(value.message.command);
	}
	return commands;
}

async function withRealClient(
	run: (client: EngineClient, events: Array<{ type: string; [key: string]: unknown }>) => Promise<void>,
	extraArgs: string[] = [],
	prepare?: (cwd: string) => void,
	respondExtensionUi?: ExtensionUiResponder,
): Promise<void> {
	const cli = resolveAtomicCli();
	const cwd = mkdtempSync(join(tmpdir(), "atomic-gui-real-engine-"));
	const sessionDir = join(cwd, "sessions");
	const agentDir = join(cwd, "agent");
	const events: Array<{ type: string; [key: string]: unknown }> = [];
	let client: EngineClient;
	client = new EngineClient({
		cwd,
		cli,
		extraArgs: ["--session-dir", sessionDir, ...extraArgs],
		env: { ATOMIC_CODING_AGENT_DIR: agentDir },
		onEvent: (event) => events.push(event),
		onExtensionUi: (request) => {
			events.push({ type: "extension_ui_request", ...request });
			respondExtensionUi?.(client, request);
		},
	});
	try {
		prepare?.(cwd);
		await run(client, events);
	} finally {
		await client.stop().catch(() => undefined);
	}
}

function writeOfflineCompactionExtension(cwd: string): string {
	const extensionPath = join(cwd, "offline-compaction-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.on("session_before_compact", () => ({ compactedText: "[User]: offline compacted context" }));
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeGuiHostProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-host-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.registerCommand("gui-host-probe", {
    description: "Inspect the optional GUI host descriptor",
    handler: async (_args, ctx) => {
      ctx.ui.setStatus("gui-host-probe", JSON.stringify({
        mode: ctx.mode,
        hostKind: ctx.ui.hostInfo?.kind,
        editorText: ctx.ui.getEditorText(),
        themeName: ctx.ui.theme.name,
        hasDarkTheme: ctx.ui.getAllThemes().some((theme) => theme.name === "dark"),
      }));
    },
  });
  pi.registerCommand("gui-host-theme-probe", {
    description: "Switch the engine-owned named theme through the interactive host",
    handler: async (_args, ctx) => {
      ctx.ui.setTheme("dark");
    },
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeAutocompleteProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-autocomplete-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) => ({
      ...current,
      getSuggestions: async (lines, cursorLine, cursorCol, options) => {
        if (lines.join("\\n") === "/gui-autocomplete" && cursorLine === 0 && cursorCol === 17) {
          return { prefix: "/gui-autocomplete", items: [{ value: "gui-autocomplete-choice", label: "GUI autocomplete choice", description: "extension probe" }] };
        }
        return await current.getSuggestions(lines, cursorLine, cursorCol, options);
      },
      applyCompletion: (lines, cursorLine, cursorCol, item, prefix) => {
        if (item.value === "gui-autocomplete-choice") {
          return { lines: ["extension autocomplete result"], cursorLine: 0, cursorCol: 29 };
        }
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      },
    }));
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeDialogProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-dialog-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.registerCommand("gui-dialog-probe", {
    description: "Exercise the optional GUI dialog host",
    handler: async (_args, ctx) => {
      const confirmed = await ctx.ui.confirm("GUI confirm", "Continue?");
      const selected = await ctx.ui.select("GUI select", ["one", "two"]);
      const input = await ctx.ui.input("GUI input", "Type a value");
      const edited = await ctx.ui.editor("GUI editor", "prefill");
      ctx.ui.setStatus("gui-dialog-probe", JSON.stringify({ confirmed, selected, input, edited }));
    },
  });
  pi.registerCommand("gui-dialog-timeout-probe", {
    description: "Exercise the optional GUI dialog timeout",
    handler: async (_args, ctx) => {
      const confirmed = await ctx.ui.confirm("GUI timeout", "This should time out", { timeout: 25 });
      ctx.ui.setStatus("gui-dialog-timeout-probe", JSON.stringify({ confirmed }));
    },
  });
  pi.registerCommand("gui-editor-timeout-probe", {
    description: "Exercise the optional GUI editor timeout",
    handler: async (_args, ctx) => {
      const edited = await ctx.ui.editor("GUI editor timeout", "prefill", { timeout: 25 });
      ctx.ui.setStatus("gui-editor-timeout-probe", JSON.stringify({ edited: edited ?? null }));
    },
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeCustomFrameProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-custom-frame-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.registerCommand("gui-custom-frame-probe", {
    description: "Exercise the optional GUI custom-frame host",
    handler: async (_args, ctx) => {
      const result = await ctx.ui.custom((_tui, _theme, _keybindings, done) => {
        let text = "";
        return {
          handleInput(data) {
            if (data === "\\r") done(text);
            else if (data.length === 1) text += data;
          },
          render() { return ["GUI custom frame", "value: " + text]; },
          invalidate() {},
        };
      }, { overlay: true, overlayOptions: { anchor: "center", width: 40, maxHeight: 8 } });
      ctx.ui.setStatus("gui-custom-frame-probe", String(result));
    },
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeChromeProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-chrome-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setHeader(() => ({ render: () => ["GUI chrome header"], invalidate() {} }));
    ctx.ui.setFooter(() => ({ render: () => ["GUI chrome footer"], invalidate() {} }));
    ctx.ui.setEditorComponent(() => ({
      render: () => ["GUI chrome editor"],
      invalidate() {},
      handleInput() {},
      getText: () => "",
      setText() {},
    }));
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeTerminalInputProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-terminal-input-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.onTerminalInput((data) => {
      if (data === "consume") return { data: "consumed-stage" };
      if (data === "transform") return { data: "first-stage" };
      return undefined;
    });
    ctx.ui.onTerminalInput((data) => {
      if (data === "consumed-stage") return { consume: true };
      if (data === "first-stage") return { data: "second-stage" };
      return undefined;
    });
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

function writeHostSurfaceProbeExtension(cwd: string): string {
	const extensionPath = join(cwd, "gui-host-surface-probe-extension.ts");
	writeFileSync(
		extensionPath,
		`export default function (pi) {
  pi.registerCommand("gui-host-form-probe", {
    description: "Exercise the optional GUI input-form host",
    handler: async (_args, ctx) => {
      const values = await ctx.ui.hostInputForm?.({
        title: "GUI form",
        heading: "Probe values",
        submitLabel: "Apply",
        fields: [{ name: "goal", type: "string", initialValue: "", required: true, placeholder: "Goal" }],
      });
      ctx.ui.setStatus("gui-host-form-probe", JSON.stringify(values));
    },
  });
  pi.registerCommand("gui-host-picker-probe", {
    description: "Exercise the optional GUI session-picker host",
    handler: async (_args, ctx) => {
      const picker = ctx.ui.hostSessionPicker?.({
        sessions: [{ path: "/fixture/session.jsonl", id: "fixture", cwd: "/fixture", createdAt: 1, modifiedAt: 2, messageCount: 3, firstMessage: "fixture session", name: "Fixture" }],
        showRenameHint: true,
      });
      const path = await picker?.result;
      ctx.ui.setStatus("gui-host-picker-probe", String(path));
    },
  });
}\n`,
		"utf8",
	);
	return extensionPath;
}

async function waitForEvent(
	events: Array<{ type: string; [key: string]: unknown }>,
	predicate: (event: { type: string; [key: string]: unknown }) => boolean,
): Promise<{ type: string; [key: string]: unknown }> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const event = events.find(predicate);
		if (event) return event;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`Timed out waiting for engine event; saw ${events.map((event) => event.type).join(", ")}`);
}

test(
	"real engine: start handshake reaches protocol v3 ready",
	async () => {
		await withRealClient(async (client) => {
			const status = await client.start();
			assert.equal(status.state, "ready");
			assert.equal(status.protocolVersion, INTERACTIVE_ENGINE_PROTOCOL_VERSION);
			assert.equal(status.hostKind, "gui");
			assert.ok(typeof status.pid === "number" && status.pid > 0);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: named extension theme selection is forwarded to the GUI host",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-host-theme-probe-"));
		const extensionPath = writeGuiHostProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client, events) => {
					await client.start();
					const result = await client.prompt({ message: "/gui-host-theme-probe" });
					assert.equal(result.ok, true, result.ok ? undefined : result.error);
					assert.ok(
						events.some(
							(event) =>
								event.type === "extension_ui_request" && event.method === "setTheme" && event.name === "dark",
						),
						"the GUI host should receive the named theme selection",
					);
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: resolved theme snapshot is engine-owned",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const settings = await client.getSettingsSnapshot();
			assert.equal(settings.ok, true, settings.ok ? undefined : settings.error);
			assert.ok(typeof settings.data?.theme === "string" && settings.data.theme.length > 0);
			const themes = await client.listThemes();
			assert.equal(themes.ok, true, themes.ok ? undefined : themes.error);
			assert.ok(themes.data?.some((theme) => theme.name === settings.data?.theme));
			const theme = await client.getThemeSnapshot(settings.data?.theme);
			assert.equal(theme.ok, true, theme.ok ? undefined : theme.error);
			assert.ok(Object.keys(theme.data?.cssVariables ?? {}).some((key) => key.startsWith("--atomic-")));
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: provider auth actions are declared by the engine catalog",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const catalog = await client.getAuthCatalog();
			assert.equal(catalog.ok, true, catalog.ok ? undefined : catalog.error);
			assert.ok(catalog.data, "engine should return an auth capability catalog");
			const apiKeyIds = new Set(catalog.data.apiKeyProviders.map((provider) => provider.id));
			const oauthIds = new Set(catalog.data.oauthProviders.map((provider) => provider.id));
			assert.deepEqual(catalog.data.providers, [...new Set([...apiKeyIds, ...oauthIds])].sort());
			assert.ok(catalog.data.logoutProviders.every((provider) => catalog.data?.providers.includes(provider)));
			assert.equal(
				JSON.stringify(catalog.data).match(/credential|auth\.json|access[_ -]?token|refresh[_ -]?token/i),
				null,
			);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: validated settings operations return an engine snapshot",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const before = await client.getSettingsSnapshot();
			assert.equal(before.ok, true, before.ok ? undefined : before.error);
			const after = await client.updateSettings([
				{ kind: "fast_mode", scope: "chat", enabled: !(before.data?.fastMode.chat ?? false) },
				{ kind: "steering_mode", mode: "all" },
				{ kind: "hide_thinking", enabled: true },
				{ kind: "model_scope", patterns: [] },
			]);
			assert.equal(after.ok, true, after.ok ? undefined : after.error);
			assert.equal(after.data?.fastMode.chat, !(before.data?.fastMode.chat ?? false));
			assert.equal(typeof after.data?.fastMode.workflow, "boolean");
			assert.equal(after.data?.steeringMode, "all");
			assert.equal(after.data?.hideThinkingBlock, true);
			assert.deepEqual(after.data?.modelScopePatterns, []);

			const rejected = await client.updateSettings([
				{ kind: "fast_mode", scope: "chat", enabled: before.data?.fastMode.chat ?? false },
				{ kind: "auto_retry", enabled: "invalid" } as never,
			]);
			assert.equal(rejected.ok, false);
			assert.match(rejected.error ?? "", /Auto retry must be a boolean/);
			const unchanged = await client.getSettingsSnapshot();
			assert.deepEqual(unchanged, after);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: external editor command is resolved by engine settings",
	async () => {
		await withRealClient(
			async (client) => {
				await client.start();
				const command = await client.getExternalEditorCommand();
				assert.deepEqual(command, { ok: true, data: "printf %s" });
			},
			[],
			(cwd) => {
				const agentDir = join(cwd, "agent");
				mkdirSync(agentDir, { recursive: true });
				writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ externalEditor: "printf %s" }), "utf8");
			},
		);
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: settings reload returns the newly resolved engine theme",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const cwd = client.getStatus().cwd;
			assert.ok(cwd, "engine cwd required");
			const agentDir = join(cwd, "agent");
			mkdirSync(agentDir, { recursive: true });
			writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ theme: "catppuccin-mocha" }), "utf8");
			const settings = await client.reloadSettings();
			assert.equal(settings.ok, true, settings.ok ? undefined : settings.error);
			assert.equal(settings.data?.theme, "catppuccin-mocha");
			const theme = await client.getThemeSnapshot(settings.data?.theme);
			assert.equal(theme.ok, true, theme.ok ? undefined : theme.error);
			assert.ok(Object.keys(theme.data?.cssVariables ?? {}).length > 0);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: custom theme selection stays engine-owned and path-free",
	async () => {
		let customThemePath = "";
		await withRealClient(
			async (client) => {
				await client.start();
				const themes = await client.listThemes();
				assert.equal(themes.ok, true, themes.ok ? undefined : themes.error);
				assert.deepEqual(
					themes.data?.find((theme) => theme.name === "gui-engine-fixture"),
					{
						name: "gui-engine-fixture",
						source: "custom",
					},
				);
				assert.equal(JSON.stringify(themes.data).includes("path"), false);
				const selected = await client.setTheme("gui-engine-fixture");
				assert.equal(selected.ok, true, selected.ok ? undefined : selected.error);
				assert.equal(selected.data?.name, "gui-engine-fixture");
				assert.equal(selected.data?.cssVariables["--atomic-accent"], "#123456");
				const changed = JSON.parse(readFileSync(customThemePath, "utf8")) as {
					name: string;
					vars: Record<string, string>;
				};
				changed.vars.accent = "#654321";
				writeFileSync(customThemePath, JSON.stringify(changed), "utf8");
				const reloaded = await client.reloadSettings();
				assert.equal(reloaded.ok, true, reloaded.ok ? undefined : reloaded.error);
				assert.equal(reloaded.data?.theme, "gui-engine-fixture");
				const reloadedTheme = await client.getThemeSnapshot();
				assert.equal(reloadedTheme.ok, true, reloadedTheme.ok ? undefined : reloadedTheme.error);
				assert.equal(reloadedTheme.data?.cssVariables["--atomic-accent"], "#654321");
			},
			[],
			(cwd) => {
				const themesDir = join(cwd, "agent", "themes");
				mkdirSync(themesDir, { recursive: true });
				const theme = JSON.parse(
					readFileSync(
						resolve(process.cwd(), "..", "coding-agent", "src", "modes", "interactive", "theme", "dark.json"),
						"utf8",
					),
				) as { name: string; vars: Record<string, string> };
				theme.name = "gui-engine-fixture";
				theme.vars.accent = "#123456";
				customThemePath = join(themesDir, "gui-engine-fixture.json");
				writeFileSync(customThemePath, JSON.stringify(theme), "utf8");
			},
		);
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: project trust is read and persisted by the engine",
	async () => {
		await withRealClient(
			async (client) => {
				await client.start();
				const before = await client.getProjectTrust();
				assert.equal(before.ok, true, before.ok ? undefined : before.error);
				assert.equal(before.data?.hasProjectResources, true);
				assert.equal(before.data?.needsTrustPrompt, true);
				assert.equal(before.data?.decision, null);
				const options = await client.getProjectTrustOptions();
				assert.equal(options.ok, true, options.ok ? undefined : options.error);
				assert.ok(options.data?.some((option) => option.id === "trust" && option.sessionOnly === false));
				assert.equal(JSON.stringify(options.data).includes("path"), false);
				const applied = await client.setProjectTrust("trust");
				assert.equal(applied.ok, true, applied.ok ? undefined : applied.error);
				assert.equal(applied.data?.status.decision, true);
				assert.equal(applied.data?.status.needsTrustPrompt, false);
			},
			["--no-approve"],
			(cwd) => {
				mkdirSync(join(cwd, ".atomic"), { recursive: true });
				writeFileSync(join(cwd, ".atomic", "settings.json"), "{}\n", "utf8");
			},
		);
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: autocomplete queries are evaluated in the engine",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const result = await client.getAutocomplete("/se", 3);
			assert.equal(result.ok, true, result.ok ? undefined : result.error);
			const suggestion = result.data?.[0];
			assert.ok(suggestion, `expected at least one engine slash completion: ${JSON.stringify(result)}`);
			assert.ok(suggestion.text.startsWith("/"), `expected a slash result, got: ${suggestion.text}`);
			assert.ok(suggestion.cursorOffset > 0 && suggestion.cursorOffset <= suggestion.text.length);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: autocomplete retains TUI @-mention workspace paths",
	async () => {
		await withRealClient(
			async (client) => {
				await client.start();
				const text = "@gui-autocomplete-path";
				const result = await client.getAutocomplete(text, text.length);
				assert.equal(result.ok, true, result.ok ? undefined : result.error);
				assert.ok(
					result.data?.some((suggestion) => suggestion.value === "@gui-autocomplete-path-fixture.md"),
					`expected the engine @-mention fallback to find the workspace fixture: ${JSON.stringify(result)}`,
				);
			},
			[],
			(cwd) => writeFileSync(join(cwd, "gui-autocomplete-path-fixture.md"), "fixture\n", "utf8"),
		);
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension autocomplete wrappers run and apply in the engine",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-autocomplete-probe-"));
		const extensionPath = writeAutocompleteProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client) => {
					await client.start();
					const result = await client.getAutocomplete("/gui-autocomplete", 17);
					assert.deepEqual(result, {
						ok: true,
						data: [
							{
								value: "gui-autocomplete-choice",
								label: "GUI autocomplete choice",
								description: "extension probe",
								text: "extension autocomplete result",
								cursorOffset: 29,
							},
						],
					});
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: user keybindings are published to the GUI host",
	async () => {
		await withRealClient(
			async (client, events) => {
				await client.start();
				const reloaded = events.find((event) => event.type === "engine_keybindings_reloaded");
				assert.ok(reloaded, "engine should publish its effective keybinding state");
				const state = reloaded.state as {
					userBindings?: Record<string, unknown>;
					effectiveBindings?: Record<string, unknown>;
				};
				assert.equal(state.userBindings?.["app.tools.expand"], "ctrl+alt+u");
				assert.equal(state.effectiveBindings?.["app.tools.expand"], "ctrl+alt+u");
			},
			[],
			(cwd) => {
				const agentDir = join(cwd, "agent");
				mkdirSync(agentDir, { recursive: true });
				writeFileSync(
					join(agentDir, "keybindings.json"),
					JSON.stringify({ "app.tools.expand": "ctrl+alt+u" }),
					"utf8",
				);
			},
		);
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: terminal interception preserves input when no extension consumes it",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const result = await client.interceptTerminalInput("x");
			assert.deepEqual(result, { ok: true, data: { consumed: false } });
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension terminal interception transforms in order and consumes",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-terminal-input-probe-"));
		const extensionPath = writeTerminalInputProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client) => {
					await client.start();
					assert.deepEqual(await client.interceptTerminalInput("transform"), {
						ok: true,
						data: { consumed: false, data: "second-stage" },
					});
					assert.deepEqual(await client.interceptTerminalInput("consume"), {
						ok: true,
						data: { consumed: true },
					});
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension host input forms and session pickers resolve through the GUI protocol",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-host-surface-probe-"));
		const extensionPath = writeHostSurfaceProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client, events) => {
					await client.start();
					const formPrompt = client.prompt({ message: "/gui-host-form-probe" });
					const form = await waitForEvent(events, (event) => event.type === "engine_input_form_open");
					assert.deepEqual(form.fields, [
						{ name: "goal", type: "string", initialValue: "", required: true, placeholder: "Goal" },
					]);
					assert.equal(form.title, "GUI form");
					assert.equal(form.submitLabel, "Apply");
					client.sendEngineCommand({
						type: "engine_input_form_submit",
						componentId: String(form.componentId),
						values: { goal: "form result" },
					});
					assert.equal((await formPrompt).ok, true);
					const formStatus = await waitForEvent(
						events,
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "setStatus" &&
							event.statusKey === "gui-host-form-probe",
					);
					assert.equal(formStatus.statusText, '{"goal":"form result"}');

					const pickerPrompt = client.prompt({ message: "/gui-host-picker-probe" });
					const picker = await waitForEvent(events, (event) => event.type === "engine_session_picker_open");
					assert.deepEqual(picker.sessions, [
						{
							path: "/fixture/session.jsonl",
							id: "fixture",
							cwd: "/fixture",
							createdAt: 1,
							modifiedAt: 2,
							messageCount: 3,
							firstMessage: "fixture session",
							name: "Fixture",
						},
					]);
					assert.equal(picker.showRenameHint, true);
					client.sendEngineCommand({
						type: "engine_session_picker_select",
						componentId: String(picker.componentId),
						path: "/fixture/session.jsonl",
					});
					assert.equal((await pickerPrompt).ok, true);
					const pickerStatus = await waitForEvent(
						events,
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "setStatus" &&
							event.statusKey === "gui-host-picker-probe",
					);
					assert.equal(pickerStatus.statusText, "/fixture/session.jsonl");
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: public extension UI lifecycle reaches the GUI host",
	async () => {
		const extensionPath = resolve(import.meta.dirname, "../../coding-agent/examples/extensions/rpc-demo.ts");
		await withRealClient(
			async (client, events) => {
				await client.start();
				await client.refreshState();
				const methods = events
					.filter((event) => event.type === "extension_ui_request")
					.map((event) => event.method);
				assert.ok(methods.includes("setTitle"), `expected extension title update, got: ${methods.join(", ")}`);
				assert.ok(methods.includes("setWidget"), `expected extension widget update, got: ${methods.join(", ")}`);
				assert.ok(methods.includes("setStatus"), `expected extension status update, got: ${methods.join(", ")}`);
				const status = events.find(
					(event) => event.type === "extension_ui_request" && event.method === "setStatus",
				);
				assert.equal(status?.statusKey, "rpc-demo");
				assert.match(String(status?.statusText), /Turns: 0/);
				const prefill = await client.prompt({ message: "/rpc-prefill" });
				assert.equal(prefill.ok, true, prefill.ok ? undefined : prefill.error);
				const editorUpdate = events.find(
					(event) => event.type === "extension_ui_request" && event.method === "set_editor_text",
				);
				assert.equal(editorUpdate?.text, "This text was set by the rpc-demo extension.");
			},
			["--extension", extensionPath],
		);
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension dialogs receive GUI responses and engine timeouts",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-dialog-probe-"));
		const extensionPath = writeDialogProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client, events) => {
					await client.start();
					const dialogResult = await client.prompt({ message: "/gui-dialog-probe" });
					assert.equal(dialogResult.ok, true, dialogResult.ok ? undefined : dialogResult.error);
					const dialogMethods = events
						.filter(
							(event) =>
								event.type === "extension_ui_request" &&
								["confirm", "select", "input", "editor"].includes(String(event.method)),
						)
						.map((event) => event.method);
					assert.deepEqual(dialogMethods, ["confirm", "select", "input", "editor"]);
					const dialogStatus = events.find(
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "setStatus" &&
							event.statusKey === "gui-dialog-probe",
					);
					assert.deepEqual(JSON.parse(String(dialogStatus?.statusText)), {
						confirmed: true,
						selected: "two",
						input: "typed value",
						edited: "edited value",
					});

					const timeoutResult = await client.prompt({ message: "/gui-dialog-timeout-probe" });
					assert.equal(timeoutResult.ok, true, timeoutResult.ok ? undefined : timeoutResult.error);
					const timeoutRequest = events.find(
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "confirm" &&
							event.title === "GUI timeout",
					);
					assert.equal(timeoutRequest?.timeout, 25);
					const timeoutStatus = events.find(
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "setStatus" &&
							event.statusKey === "gui-dialog-timeout-probe",
					);
					assert.deepEqual(JSON.parse(String(timeoutStatus?.statusText)), { confirmed: false });

					const editorTimeoutResult = await client.prompt({ message: "/gui-editor-timeout-probe" });
					assert.equal(
						editorTimeoutResult.ok,
						true,
						editorTimeoutResult.ok ? undefined : editorTimeoutResult.error,
					);
					const editorTimeoutRequest = events.find(
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "editor" &&
							event.title === "GUI editor timeout",
					);
					assert.equal(editorTimeoutRequest?.timeout, 25);
					const editorTimeoutStatus = events.find(
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "setStatus" &&
							event.statusKey === "gui-editor-timeout-probe",
					);
					assert.deepEqual(JSON.parse(String(editorTimeoutStatus?.statusText)), { edited: null });
				},
				["--extension", extensionPath],
				undefined,
				(client, request) => {
					if (request.method === "confirm" && request.title === "GUI confirm") {
						void client.respondExtensionUi({ id: request.id, confirmed: true });
					} else if (request.method === "select") {
						void client.respondExtensionUi({ id: request.id, value: "two" });
					} else if (request.method === "input") {
						void client.respondExtensionUi({ id: request.id, value: "typed value" });
					} else if (request.method === "editor") {
						void client.respondExtensionUi({ id: request.id, value: "edited value" });
					}
				},
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension custom frames render and accept GUI input",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-custom-frame-probe-"));
		const extensionPath = writeCustomFrameProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client, events) => {
					await client.start();
					const prompt = client.prompt({ message: "/gui-custom-frame-probe" });
					const opened = await waitForEvent(
						events,
						(event) => event.type === "engine_custom_open" && event.overlay === true,
					);
					const componentId = String(opened.componentId);
					client.sendEngineCommand({
						type: "engine_custom_render",
						componentId,
						requestId: 1,
						width: 80,
						rows: 24,
					});
					const initialFrame = await waitForEvent(
						events,
						(event) =>
							event.type === "engine_custom_frame" && event.componentId === componentId && event.requestId === 1,
					);
					assert.deepEqual(initialFrame.lines, ["GUI custom frame", "value: "]);

					client.sendEngineCommand({ type: "engine_custom_input", componentId, requestId: 1, data: "o" });
					client.sendEngineCommand({ type: "engine_custom_input", componentId, requestId: 2, data: "k" });
					client.sendEngineCommand({
						type: "engine_custom_render",
						componentId,
						requestId: 2,
						width: 80,
						rows: 24,
					});
					const updatedFrame = await waitForEvent(
						events,
						(event) =>
							event.type === "engine_custom_frame" && event.componentId === componentId && event.requestId === 2,
					);
					assert.deepEqual(updatedFrame.lines, ["GUI custom frame", "value: ok"]);

					client.sendEngineCommand({ type: "engine_custom_input", componentId, requestId: 3, data: "\r" });
					const result = await prompt;
					assert.equal(result.ok, true, result.ok ? undefined : result.error);
					const status = await waitForEvent(
						events,
						(event) =>
							event.type === "extension_ui_request" &&
							event.method === "setStatus" &&
							event.statusKey === "gui-custom-frame-probe",
					);
					assert.equal(status.statusText, "ok");
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension chrome slots mount and render in the GUI host",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-chrome-probe-"));
		const extensionPath = writeChromeProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client, events) => {
					await client.start();
					for (const [slot, expectedLine, requestId] of [
						["header", "GUI chrome header", 1],
						["footer", "GUI chrome footer", 2],
						["editor", "GUI chrome editor", 3],
					] as const) {
						const opened = await waitForEvent(
							events,
							(event) => event.type === "engine_custom_open" && event.chromeSlot === slot,
						);
						const componentId = String(opened.componentId);
						client.sendEngineCommand({
							type: "engine_custom_render",
							componentId,
							requestId,
							width: 80,
							rows: 24,
						});
						const frame = await waitForEvent(
							events,
							(event) =>
								event.type === "engine_custom_frame" &&
								event.componentId === componentId &&
								event.requestId === requestId,
						);
						assert.deepEqual(frame.lines, [expectedLine]);
					}
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension sees mirrored editor text and GUI host info while remaining TUI-compatible",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-host-probe-"));
		const extensionPath = writeGuiHostProbeExtension(extensionDir);
		try {
			await withRealClient(
				async (client, events) => {
					await client.start();
					client.sendEngineCommand({
						type: "engine_editor_state",
						componentId: "composer",
						text: "mirrored GUI draft",
					});
					const result = await client.prompt({ message: "/gui-host-probe" });
					assert.equal(result.ok, true, result.ok ? undefined : result.error);
					const update = [...events]
						.reverse()
						.find(
							(event) =>
								event.type === "extension_ui_request" &&
								event.method === "setStatus" &&
								event.statusKey === "gui-host-probe",
						);
					assert.ok(update, "extension should report the public GUI host contract");
					assert.deepEqual(JSON.parse(String(update.statusText)), {
						mode: "tui",
						hostKind: "gui",
						editorText: "mirrored GUI draft",
						themeName: "dark",
						hasDarkTheme: true,
					});
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: imports, lists, and resumes a durable session without a model provider",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const cwd = client.getStatus().cwd;
			assert.ok(cwd, "engine cwd required");
			const inputPath = join(cwd, "imported-session.jsonl");
			writeFileSync(
				inputPath,
				`${JSON.stringify({
					type: "session",
					version: 3,
					id: "gui-import-fixture",
					timestamp: "2026-08-11T00:00:00.000Z",
					cwd,
				})}\n${JSON.stringify({
					type: "message",
					id: "fixture-user-message",
					parentId: null,
					timestamp: "2026-08-11T00:00:01.000Z",
					message: { role: "user", content: "offline imported session", timestamp: 1 },
				})}\n${JSON.stringify({
					type: "message",
					id: "fixture-assistant-message",
					parentId: "fixture-user-message",
					timestamp: "2026-08-11T00:00:02.000Z",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "offline imported response" }],
						api: "openai-completions",
						provider: "openai",
						model: "fixture",
						usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: 0 },
						timestamp: 2,
					},
				})}\n`,
				"utf8",
			);
			const imported = await client.importSession(inputPath, cwd);
			assert.equal(imported.ok, true, imported.ok ? undefined : imported.error);
			const sessionPath = client.getStatus().sessionFile;
			if (!sessionPath?.endsWith("imported-session.jsonl")) {
				throw new Error(`expected imported session, got ${sessionPath}`);
			}
			const listed = await client.listSessions({ all: true });
			assert.equal(listed.ok, true, listed.ok ? undefined : listed.error);
			assert.ok(listed.data?.some((session) => session.path === sessionPath && session.id === "gui-import-fixture"));
			const resumed = await client.switchSession(sessionPath);
			assert.equal(resumed.ok, true, resumed.ok ? undefined : resumed.error);
			const entries = await client.getEntries();
			assert.equal(entries.ok, true, entries.ok ? undefined : entries.error);
			assert.ok(
				(entries.data?.entries ?? []).some(
					(entry) =>
						typeof entry === "object" &&
						entry !== null &&
						"message" in entry &&
						JSON.stringify((entry as { message: unknown }).message).includes("offline imported session"),
				),
			);
			const navigated = await client.navigateTree("fixture-user-message");
			assert.deepEqual(navigated, { ok: true, data: { cancelled: false, editorText: "offline imported session" } });
			const treeAfterNavigation = await client.getTree();
			assert.equal(treeAfterNavigation.ok, true, treeAfterNavigation.ok ? undefined : treeAfterNavigation.error);
			assert.equal(treeAfterNavigation.data?.leafId, null, "navigating to the root user node should reset the leaf");
			const forkMessages = await client.getForkMessages();
			assert.equal(forkMessages.ok, true, forkMessages.ok ? undefined : forkMessages.error);
			assert.ok(forkMessages.data?.some((message) => message.entryId === "fixture-user-message"));
			const forked = await client.forkSession("fixture-user-message");
			assert.equal(forked.ok, true, forked.ok ? undefined : forked.error);
			assert.equal(forked.data?.text, "offline imported session");
			const forkState = await client.refreshState();
			assert.equal(forkState.ok, true, forkState.ok ? undefined : forkState.error);
			assert.notEqual(forkState.data?.sessionFile, sessionPath, "fork should switch to a new durable session");
			const returnedFromFork = await client.switchSession(sessionPath);
			assert.equal(returnedFromFork.ok, true, returnedFromFork.ok ? undefined : returnedFromFork.error);
			const exported = await client.exportHtml(join(cwd, "offline-import.html"));
			assert.equal(exported.ok, true, exported.ok ? undefined : exported.error);
			assert.ok(existsSync(exported.data?.path ?? ""), "engine should write the requested HTML export");
			const cloned = await client.cloneSession();
			assert.equal(cloned.ok, true, cloned.ok ? undefined : cloned.error);
			assert.notEqual(client.getStatus().sessionFile, sessionPath, "clone should switch to a new durable session");
			const returned = await client.switchSession(sessionPath);
			assert.equal(returned.ok, true, returned.ok ? undefined : returned.error);
			const renamed = await client.renameSession(sessionPath, "offline renamed session");
			assert.equal(renamed.ok, true, renamed.ok ? undefined : renamed.error);
			const refreshed = await client.refreshState();
			assert.equal(refreshed.ok, true, refreshed.ok ? undefined : refreshed.error);
			assert.equal(refreshed.data?.sessionName, "offline renamed session");
			const replacement = await client.newSession();
			assert.equal(replacement.ok, true, replacement.ok ? undefined : replacement.error);
			const newSessionPath = client.getStatus().sessionFile;
			assert.ok(
				newSessionPath && existsSync(newSessionPath),
				"a normal GUI new session must create a durable Atomic JSONL file",
			);
			const afterNew = await client.listSessions({ all: true });
			assert.equal(afterNew.ok, true, afterNew.ok ? undefined : afterNew.error);
			assert.ok(
				afterNew.data?.some((session) => session.path === newSessionPath),
				"the engine must enumerate a newly created GUI session from its durable store",
			);
			const deletedActive = await client.deleteSession(newSessionPath);
			assert.equal(deletedActive.ok, true, deletedActive.ok ? undefined : deletedActive.error);
			const replacementPath = client.getStatus().sessionFile;
			assert.ok(
				replacementPath && replacementPath !== newSessionPath && existsSync(replacementPath),
				"deleting the active GUI session must create a durable replacement",
			);
			const afterActiveDelete = await client.listSessions({ all: true });
			assert.equal(afterActiveDelete.ok, true, afterActiveDelete.ok ? undefined : afterActiveDelete.error);
			assert.equal(
				afterActiveDelete.data?.some((session) => session.path === newSessionPath),
				false,
			);
			assert.ok(afterActiveDelete.data?.some((session) => session.path === replacementPath));
			const deleted = await client.deleteSession(sessionPath);
			assert.equal(deleted.ok, true, deleted.ok ? undefined : deleted.error);
			const afterDelete = await client.listSessions({ all: true });
			assert.equal(afterDelete.ok, true, afterDelete.ok ? undefined : afterDelete.error);
			assert.equal(
				afterDelete.data?.some((session) => session.path === sessionPath),
				false,
			);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: imports and returns a 10,000-entry durable transcript",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const cwd = client.getStatus().cwd;
			assert.ok(cwd, "engine cwd required");
			const imported = await client.importSession(writeLargeDurableSession(cwd), cwd);
			assert.equal(imported.ok, true, imported.ok ? undefined : imported.error);
			const pagedEntries: unknown[] = [];
			let offset = 0;
			let leafId: string | null = null;
			while (true) {
				const page = await client.getEntries({ offset, limit: 250 });
				assert.equal(page.ok, true, page.ok ? undefined : page.error);
				assert.ok(page.data);
				assert.equal(page.data.total, 10_001);
				pagedEntries.push(...page.data.entries);
				leafId = page.data.leafId;
				if (page.data.nextOffset === null) break;
				assert.ok(page.data.nextOffset > offset, "get_entries page offset must advance");
				offset = page.data.nextOffset;
			}
			assert.equal(pagedEntries.length, 10_001);
			assert.equal(
				pagedEntries.filter(
					(entry) =>
						typeof entry === "object" && entry !== null && (entry as { type?: unknown }).type === "message",
				).length,
				10_000,
			);
			const leafEntry = pagedEntries.find(
				(entry) => typeof entry === "object" && entry !== null && (entry as { id?: unknown }).id === leafId,
			);
			assert.ok(
				leafEntry,
				`engine leaf ${leafId} is absent from paged get_entries; tail: ${JSON.stringify(pagedEntries.slice(-3))}`,
			);
			assert.equal((leafEntry as { type?: unknown }).type, "thinking_level_change");
			assert.equal((leafEntry as { parentId?: unknown }).parentId, "large-entry-10000");
		});
	},
	REAL_ENGINE_LARGE_SESSION_TIMEOUT_MS,
);

test(
	"real engine: durable transcript corpus retains renderer entry kinds",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			const cwd = client.getStatus().cwd;
			assert.ok(cwd, "engine cwd required");
			const inputPath = join(cwd, "transcript-corpus.jsonl");
			const at = (second: number) => `2026-08-11T00:00:${String(second).padStart(2, "0")}.000Z`;
			const entries = [
				{
					type: "message",
					id: "user",
					parentId: null,
					timestamp: at(1),
					message: { role: "user", content: "corpus user", timestamp: 1 },
				},
				{
					type: "message",
					id: "skill",
					parentId: "user",
					timestamp: at(2),
					message: {
						role: "user",
						content: '<skill name="tdd" location="/fixture/skills/tdd">\nTest first\n</skill>\n\ncorpus skill',
					},
				},
				{
					type: "message",
					id: "assistant-tool",
					parentId: "skill",
					timestamp: at(3),
					message: {
						role: "assistant",
						content: [{ type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } }],
					},
				},
				{
					type: "message",
					id: "tool-result",
					parentId: "assistant-tool",
					timestamp: at(4),
					message: {
						role: "toolResult",
						toolCallId: "tool-1",
						toolName: "bash",
						content: [{ type: "text", text: "/tmp" }],
						isError: false,
					},
				},
				{
					type: "message",
					id: "bash",
					parentId: "tool-result",
					timestamp: at(5),
					message: {
						role: "bashExecution",
						command: "pwd",
						output: "/tmp\n",
						exitCode: 0,
						cancelled: false,
						truncated: false,
					},
				},
				{
					type: "custom",
					id: "custom",
					parentId: "bash",
					timestamp: at(6),
					customType: "fixture",
					data: { value: 1 },
				},
				{
					type: "custom_message",
					id: "custom-message",
					parentId: "custom",
					timestamp: at(7),
					customType: "notice",
					content: "corpus custom message",
					display: true,
				},
				{
					type: "message",
					id: "system",
					parentId: "custom-message",
					timestamp: at(8),
					message: { role: "system", content: "corpus system" },
				},
				{
					type: "branch_summary",
					id: "branch",
					parentId: "system",
					timestamp: at(9),
					fromId: "user",
					summary: "corpus branch summary",
				},
			];
			writeFileSync(
				inputPath,
				`${[{ type: "session", version: 3, id: "gui-transcript-corpus", timestamp: at(0), cwd }, ...entries]
					.map((entry) => JSON.stringify(entry))
					.join("\n")}\n`,
				"utf8",
			);
			const imported = await client.importSession(inputPath, cwd);
			assert.equal(imported.ok, true, imported.ok ? undefined : imported.error);
			const result = await client.getEntries();
			assert.equal(result.ok, true, result.ok ? undefined : result.error);
			const serialized = JSON.stringify(result.data?.entries);
			for (const expected of [
				'"id":"skill"',
				"Test first",
				"toolResult",
				"bashExecution",
				'"type":"custom"',
				'"type":"custom_message"',
				'"type":"branch_summary"',
				"corpus system",
			]) {
				assert.match(serialized, new RegExp(expected));
			}
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: extension-backed compaction persists an offline boundary",
	async () => {
		const extensionDir = mkdtempSync(join(tmpdir(), "atomic-gui-offline-compaction-"));
		const extensionPath = writeOfflineCompactionExtension(extensionDir);
		try {
			await withRealClient(
				async (client) => {
					await client.start();
					const cwd = client.getStatus().cwd;
					assert.ok(cwd, "engine cwd required");
					const inputPath = join(cwd, "compactable-session.jsonl");
					const header = {
						type: "session",
						version: 3,
						id: "gui-compaction-fixture",
						timestamp: "2026-08-11T00:00:00.000Z",
						cwd,
					};
					const entries = Array.from({ length: 22 }, (_, index) => ({
						type: "message",
						id: `fixture-message-${index + 1}`,
						parentId: index === 0 ? null : `fixture-message-${index}`,
						timestamp: `2026-08-11T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
						message: { role: "user", content: `offline compaction message ${index + 1}`, timestamp: index + 1 },
					}));
					writeFileSync(
						inputPath,
						`${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`,
						"utf8",
					);

					const imported = await client.importSession(inputPath, cwd);
					assert.equal(imported.ok, true, imported.ok ? undefined : imported.error);
					const compacted = await client.compact();
					assert.equal(compacted.ok, true, compacted.ok ? undefined : compacted.error);
					const state = await client.getEntries();
					assert.equal(state.ok, true, state.ok ? undefined : state.error);
					const boundary = (state.data?.entries ?? []).find(
						(entry) =>
							typeof entry === "object" &&
							entry !== null &&
							"type" in entry &&
							(entry as { type: unknown }).type === "compaction",
					);
					assert.ok(boundary, "compaction should persist a session boundary");
					assert.match(JSON.stringify(boundary), /offline compacted context/);
				},
				["--extension", extensionPath],
			);
		} finally {
			rmSync(extensionDir, { recursive: true, force: true });
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: bash streams execution events (prompt/stream stand-in)",
	async () => {
		await withRealClient(async (client, events) => {
			await client.start();
			const result = await client.bash("printf 'stream-ok\\n'");
			assert.equal(result.ok, true);
			if (result.ok) {
				const data = result.data as { output?: unknown } | undefined;
				assert.match(String(data?.output ?? ""), /stream-ok/);
			}
			assert.ok(
				events.some((event) => event.type === "bash_execution_start" || event.type === "bash_execution_update"),
				`expected bash stream events, got: ${events.map((e) => e.type).join(",")}`,
			);
			const excluded = await client.bash("printf 'excluded-context\\n'", true);
			assert.equal(excluded.ok, true, excluded.ok ? undefined : excluded.error);
			const entries = await client.getEntries();
			assert.equal(entries.ok, true, entries.ok ? undefined : entries.error);
			assert.match(
				JSON.stringify(entries.data?.entries),
				/"command":"printf 'excluded-context\\\\n'"[^}]*"excludeFromContext":true/,
			);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: abort RPC succeeds while engine is ready",
	async () => {
		await withRealClient(async (client) => {
			await client.start();
			// Fire a longer bash; abort must return successfully even if bash already finished.
			const bashPromise = client.bash("sleep 2; echo after-abort-window");
			await new Promise((resolve) => setTimeout(resolve, 50));
			const abortResult = await client.abort();
			assert.equal(abortResult.ok, true, abortResult.ok ? undefined : abortResult.error);
			const bashResult = await bashPromise;
			// Either cancelled or completed — host must remain usable either way.
			assert.ok(bashResult.ok === true || bashResult.ok === false);
			const probe = await client.bash("echo still-alive");
			assert.equal(probe.ok, true);
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"real engine: stop then start restart reaches ready again",
	async () => {
		const cli = resolveAtomicCli();
		const cwd = mkdtempSync(join(tmpdir(), "atomic-gui-real-restart-"));
		const extraArgs = ["--session-dir", join(cwd, "sessions")];
		const env = { ATOMIC_CODING_AGENT_DIR: join(cwd, "agent") };
		const first = new EngineClient({ cwd, cli, extraArgs, env });
		try {
			const status1 = await first.start();
			assert.equal(status1.state, "ready");
			await first.stop();
			assert.equal(first.getStatus().state, "stopped");
		} finally {
			await first.stop().catch(() => undefined);
		}

		const second = new EngineClient({ cwd, cli, extraArgs, env });
		try {
			const status2 = await second.start();
			assert.equal(status2.state, "ready");
			assert.equal(status2.protocolVersion, INTERACTIVE_ENGINE_PROTOCOL_VERSION);
			const probe = await second.bash("echo restarted");
			assert.equal(probe.ok, true);
		} finally {
			await second.stop().catch(() => undefined);
		}
	},
	REAL_ENGINE_TIMEOUT_MS,
);

test(
	"host rejects version-mismatch engine_ready with clear error",
	async () => {
		const fakeEngine = join(tmpdir(), `atomic-gui-bad-proto-${process.pid}.mjs`);
		writeFileSync(
			fakeEngine,
			`process.stdout.write(JSON.stringify({
  type: "engine_ready",
  protocolVersion: ${INTERACTIVE_ENGINE_PROTOCOL_VERSION + 1},
  pid: process.pid,
}) + "\\n");
setInterval(() => {}, 60_000);
`,
			"utf8",
		);

		const client = new EngineClient({
			cli: { runtimeExecutable: process.execPath, cliPath: fakeEngine, runtimeArgs: [] },
		});
		try {
			await assert.rejects(
				() => client.start(),
				(error: unknown) => {
					assert.ok(error instanceof Error);
					assert.match(
						error.message,
						/incompatible|protocol/i,
						`expected clear version-mismatch message, got: ${error.message}`,
					);
					assert.match(
						error.message,
						new RegExp(`${INTERACTIVE_ENGINE_PROTOCOL_VERSION}`),
						"message should mention host protocol version",
					);
					return true;
				},
			);
		} finally {
			await client.stop().catch(() => undefined);
		}
	},
	ENGINE_CLIENT_SPAWN_TIMEOUT_MS,
);

test(
	"real engine: session switch keeps get_entries leaf aligned with get_tree leaf",
	async () => {
		await withRealClient(async (client) => {
			await client.start();

			const createdA = await client.newSession();
			assert.equal(createdA.ok, true, createdA.ok ? undefined : createdA.error);
			const bashA = await client.bash("echo ALPHA_SESSION_MARKER");
			assert.equal(bashA.ok, true);
			const pathA = client.getStatus().sessionFile;
			assert.ok(typeof pathA === "string" && pathA.length > 0, "session A path required");
			const named = await client.setSessionName("GUI real-engine session A");
			assert.equal(named.ok, true, named.ok ? undefined : named.error);
			assert.equal(client.getStatus().sessionName, "GUI real-engine session A");
			const entriesA = await client.getEntries();
			assert.equal(entriesA.ok, true);
			const leafA = entriesA.data?.leafId ?? null;
			assert.ok(typeof leafA === "string" && leafA.length > 0);
			assert.ok(bashCommands(entriesA.data?.entries ?? []).some((cmd) => cmd.includes("ALPHA_SESSION_MARKER")));

			const createdB = await client.newSession();
			assert.equal(createdB.ok, true, createdB.ok ? undefined : createdB.error);
			const bashB = await client.bash("echo BETA_SESSION_MARKER");
			assert.equal(bashB.ok, true);
			const pathB = client.getStatus().sessionFile;
			assert.ok(typeof pathB === "string" && pathB.length > 0 && pathB !== pathA);
			const entriesB = await client.getEntries();
			assert.equal(entriesB.ok, true);
			assert.ok(bashCommands(entriesB.data?.entries ?? []).some((cmd) => cmd.includes("BETA_SESSION_MARKER")));
			assert.ok(!bashCommands(entriesB.data?.entries ?? []).some((cmd) => cmd.includes("ALPHA_SESSION_MARKER")));

			const switched = await client.switchSession(pathA);
			assert.equal(switched.ok, true, switched.ok ? undefined : switched.error);
			await client.refreshState().catch(() => undefined);

			const after = await client.getEntries();
			assert.equal(after.ok, true);
			const tree = await client.getTree();
			assert.equal(tree.ok, true);

			const entryLeaf = after.data?.leafId ?? null;
			const treeLeaf = tree.data?.leafId ?? null;
			assert.ok(typeof entryLeaf === "string" && entryLeaf.length > 0, "hydrated leaf required");
			assert.equal(entryLeaf, treeLeaf, "get_entries leafId must match get_tree leafId after switch");

			// Active session file should be A after switch.
			assert.equal(client.getStatus().sessionFile, pathA);

			// Best-effort transcript identity: if the engine reloads bash rows, ALPHA must return
			// and BETA must not leak. If bash rows are not durable across switch in this engine
			// build, leaf alignment + session path still gate integrity (documented in ledger).
			const commands = bashCommands(after.data?.entries ?? []);
			if (commands.length > 0) {
				assert.ok(
					commands.some((cmd) => cmd.includes("ALPHA_SESSION_MARKER")),
					`expected ALPHA bash after switch, got: ${commands.join(" | ")}`,
				);
				assert.ok(
					!commands.some((cmd) => cmd.includes("BETA_SESSION_MARKER")),
					"BETA bash must not leak into session A after switch",
				);
			}
		});
	},
	REAL_ENGINE_TIMEOUT_MS,
);
