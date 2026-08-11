import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { afterEach, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const electronMain = join(repoRoot, "packages/gui/out/main/index.js");
let app: ElectronApplication | undefined;
const tempPaths: string[] = [];

function tempDir(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	tempPaths.push(path);
	return path;
}

/** Stateful protocol-v2 stand-in. It rejects unknown RPCs so renderer flows must use real command shapes. */
function writeProtocolFixture(delayInitialEntries = false): string {
	const path = join(tempDir("atomic-gui-e2e-fixture-"), "engine.mjs");
	writeFileSync(
		path,
		String.raw`
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const response = (request, success = true, data, error) => send({ type: "response", command: request.type, id: request.id, success, ...(success ? { data } : { error }) });
const accept = (request) => send({ type: "engine_request_accepted", requestId: request.id, command: request.type });
const message = (id, parentId, role, content) => ({ id, ...(parentId ? { parentId } : {}), type: "message", message: { role, content } });
const sessions = {
  main: { file: "/tmp/main.jsonl", name: "main", entries: [message("root", null, "user", "fixture prompt"), message("leaf", "root", "assistant", "fixture reply")], leaf: "leaf" },
  fork: { file: "/tmp/fork.jsonl", name: "fork", entries: [message("fork-root", null, "user", "fork durable prompt"), message("fork-leaf", "fork-root", "assistant", "fork durable reply")], leaf: "fork-leaf" },
  imported: { file: "/tmp/imported.jsonl", name: "imported", entries: [message("import-root", null, "user", "imported durable prompt"), message("edit-target", "import-root", "user", "edit target"), message("import-leaf", "edit-target", "assistant", "imported leaf")], leaf: "import-leaf" },
};
let active = "main";
let queues = { steering: [], followUp: [] };
const labels = new Map();
const current = () => sessions[active];
const tree = () => {
  const entries = current().entries;
  const byId = new Map(entries.map((entry) => [entry.id, { entry, ...(labels.has(entry.id) ? { label: labels.get(entry.id) } : {}), children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.entry.parentId && byId.has(node.entry.parentId)) byId.get(node.entry.parentId).children.push(node);
    else roots.push(node);
  }
  return roots;
};
const queueUpdate = () => send({ type: "queue_update", steering: queues.steering, followUp: queues.followUp });
const appendPrompt = (text) => {
  const session = current();
  const userId = "user-" + (session.entries.length + 1);
  const assistantId = "assistant-" + (session.entries.length + 2);
  session.entries.push(message(userId, session.leaf, "user", text), message(assistantId, userId, "assistant", "reply: " + text));
  session.leaf = assistantId;
};
const openWorkflowGraph = () => {
  send({ type: "engine_custom_open", componentId: "workflow-graph", overlay: true, handlesCtrlC: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%", margin: 0 } });
  send({ type: "engine_custom_frame", componentId: "workflow-graph", requestId: 1, lines: ["workflow graph", "run-a → stage-1"] });
  send({ type: "extension_ui_request", id: "workflow-dialog", method: "input", title: "Workflow note", placeholder: "Add a note" });
  send({ type: "extension_ui_request", id: "workflow-widget", method: "setWidget", widgetKey: "workflow.run", widgetLines: ["run-a · running"], widgetPlacement: "belowEditor" });
};
const emitIncomingIntercomMessage = () => {
  const message = { role: "custom", customType: "intercom_message", content: "**📨 From fixture-peer**\n\nReceived through the generic host", display: true };
  send({ type: "message_start", message });
  send({ type: "message_end", message });
};
let incomingIntercomMessageDelivered = false;
send({ type: "engine_ready", protocolVersion: 2, pid: process.pid });
let subagentRenderCount = 0;
let delayInitialEntries = ${delayInitialEntries};
let pendingInitialEntries;
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
  for (;;) {
    const at = input.indexOf("\n");
    if (at < 0) break;
    const line = input.slice(0, at); input = input.slice(at + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.type === "engine_custom_input") {
      if (typeof request.data === "string" && request.data.includes(":3u")) continue;
      if (request.componentId === "mcp-auth-frame") {
        if (request.data === "\u0003") {
          send({ type: "engine_custom_frame", componentId: "mcp-auth-frame", requestId: 2, lines: ["MCP OAuth cancellation received", "No credential was sent to the host."] });
        }
        continue;
      }
      if (request.componentId === "intercom-picker" && request.data === "\r") {
        send({ type: "engine_custom_close", componentId: "intercom-picker" });
        send({ type: "engine_custom_open", componentId: "intercom-compose", overlay: true });
        send({ type: "engine_custom_frame", componentId: "intercom-compose", requestId: 99, lines: ["Compose message to fixture-peer", "Enter sends the message"] });
      } else if (request.componentId === "intercom-compose" && request.data === "\r") {
        send({ type: "engine_custom_frame", componentId: "intercom-compose", requestId: 100, lines: ["Message sent to fixture-peer"] });
        send({ type: "engine_custom_close", componentId: "intercom-compose" });
      } else if (request.componentId === "workflow-graph" && request.data === "\u001b") {
        send({ type: "engine_custom_control", componentId: "workflow-graph", action: "hide" });
      } else if (request.componentId === "workflow-graph") {
        send({ type: "engine_custom_frame", componentId: "workflow-graph", requestId: 101, lines: ["workflow graph input: " + request.data] });
      } else if (request.componentId === "workflow-attach") {
        send({ type: "engine_custom_frame", componentId: "workflow-attach", requestId: 99, lines: ["stage attached: " + request.data] });
      } else {
        send({ type: "engine_custom_frame", componentId: request.componentId, requestId: 99, lines: ["input: " + request.data] });
      }
      continue;
    }
    if (request.type === "engine_tool_render") {
      const valid = typeof request.componentId === "string" && typeof request.requestId === "number" && typeof request.width === "number" && typeof request.toolName === "string" && typeof request.toolCallId === "string" && typeof request.executionStarted === "boolean" && typeof request.argsComplete === "boolean" && typeof request.isPartial === "boolean" && typeof request.expanded === "boolean" && typeof request.showImages === "boolean" && typeof request.imageWidthCells === "number" && request.args !== undefined;
      send({ type: "engine_custom_frame", componentId: request.componentId, requestId: request.requestId, lines: valid ? ["MCP tool · " + request.toolName, "MCP fixture result"] : ["Invalid engine_tool_render request"] });
      continue;
    }
    if (request.type === "engine_input_form_submit") {
      send({ type: "extension_ui_request", id: "workflow-dispatch", method: "notify", message: "workflow dispatched", notifyType: "info" });
      continue;
    }
    if (request.type === "extension_ui_response") {
      send({ type: "engine_custom_frame", componentId: "focus-frame", requestId: 100, lines: ["dialog response"] });
      send({ type: "engine_custom_frame", componentId: "workflow-graph", requestId: 100, lines: ["workflow dialog response"] });
      continue;
    }
    if (request.type === "engine_custom_render" && request.componentId === "subagent-widget-frame") {
      subagentRenderCount += 1;
      const complete = subagentRenderCount > 1;
      send({ type: "engine_custom_frame", componentId: request.componentId, requestId: request.requestId, lines: complete ? ["○ Async agents · background", "└─ ✓ codebase-analyzer · complete", "   ⎿  inspected protocol"] : ["● Async agents · background", "└─ ◌ codebase-analyzer · running", "   ⎿  inspecting protocol"] });
	  if (pendingInitialEntries) {
	    response(pendingInitialEntries, true, { entries: current().entries, leafId: current().leaf });
	    pendingInitialEntries = undefined;
	    if (!incomingIntercomMessageDelivered) {
	      incomingIntercomMessageDelivered = true;
	      setTimeout(emitIncomingIntercomMessage, 0);
	    }
	  }
      if (!complete) setTimeout(() => send({ type: "engine_custom_invalidate", componentId: request.componentId }), 300);
      continue;
    }
    if (!request.id || typeof request.type !== "string") continue;
    accept(request);
    if (request.type === "get_state") response(request, true, { sessionFile: current().file, sessionName: current().name, model: { provider: "fixture", id: "model" } });
    else if (request.type === "get_entries") {
      if (delayInitialEntries) { delayInitialEntries = false; pendingInitialEntries = request; }
      else {
        response(request, true, { entries: current().entries, leafId: current().leaf });
        if (!incomingIntercomMessageDelivered) {
          incomingIntercomMessageDelivered = true;
          setTimeout(emitIncomingIntercomMessage, 0);
        }
      }
    }
    else if (request.type === "get_tree") response(request, true, { tree: tree(), leafId: current().leaf });
    else if (request.type === "get_fork_messages") response(request, true, { messages: [{ entryId: "root", text: "fixture prompt" }] });
    else if (request.type === "list_sessions") response(request, true, { sessions: Object.entries(sessions).map(([id, session], index) => ({ path: session.file, id, cwd: "/tmp", name: session.name, modified: 10 + index, created: index, messageCount: session.entries.length, firstMessage: session.entries[0].message.content })) });
    else if (request.type === "get_commands") response(request, true, { commands: [{ name: "workflow", description: "Workflow runtime command" }, { name: "intercom", source: "extension", description: "Open session intercom overlay" }] });
    else if (request.type === "get_shortcuts") response(request, true, { shortcuts: [{ key: "F2", description: "Open workflow graph" }, { key: "alt+m", description: "Open session intercom" }] });
    else if (request.type === "get_available_models") response(request, true, { models: [] });
    else if (request.type === "get_session_stats") response(request, true, { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0 });
    else if (request.type === "pause_queued_messages") response(request, true);
    else if (request.type === "resume_queued_messages") { queues = { steering: [], followUp: [] }; queueUpdate(); response(request, true, { released: true }); }
    else if (request.type === "clear_queue") { const drained = queues; queues = { steering: [], followUp: [] }; response(request, true, drained); queueUpdate(); }
    else if (request.type === "abort") { send({ type: "agent_end" }); response(request, true); }
    else if (request.type === "prompt") {
      if (request.message === "open MCP OAuth login") {
        send({ type: "engine_custom_open", componentId: "mcp-auth-frame", overlay: true, handlesCtrlC: true });
        send({ type: "engine_custom_frame", componentId: "mcp-auth-frame", requestId: 1, lines: ["MCP OAuth · fixture-mcp", "Complete sign-in in your browser, or press Ctrl+C to cancel."] });
        response(request, true);
      } else if (request.message === "use MCP tool") {
        send({ type: "tool_execution_start", toolCallId: "fixture-mcp-tool", toolName: "mcp", args: { server: "fixture-mcp", tool: "lookup", query: "safe" } });
        send({ type: "tool_execution_end", toolCallId: "fixture-mcp-tool", result: { content: "MCP fixture result" }, isError: false });
        send({ type: "agent_end" });
        response(request, true);
      } else if (request.message === "use direct MCP tool") {
        send({ type: "tool_execution_start", toolCallId: "fixture-direct-mcp-tool", toolName: "fixture_mcp_lookup", args: { query: "safe" } });
        send({ type: "tool_execution_end", toolCallId: "fixture-direct-mcp-tool", result: { content: "MCP fixture result" }, isError: false });
        send({ type: "agent_end" });
        response(request, true);
      } else if (request.message === "/workflow demo") {
        send({ type: "engine_input_form_open", componentId: "workflow-form", title: "Dispatch workflow", submitLabel: "Run", fields: [{ name: "goal", type: "string", initialValue: "", description: "Goal", required: true }] });
        response(request, true);
      } else if (request.message === "/workflow list") {
        send({ type: "engine_custom_open", componentId: "workflow-list", overlay: false, deferInlineCustomUiFocus: true });
        send({ type: "engine_custom_frame", componentId: "workflow-list", requestId: 1, lines: ["workflow list", "demo"] });
        response(request, true);
      } else if (request.message === "/workflow status") {
        send({ type: "engine_custom_open", componentId: "workflow-status", overlay: false, deferInlineCustomUiFocus: true });
        send({ type: "engine_custom_frame", componentId: "workflow-status", requestId: 1, lines: ["workflow status", "run-a: running"] });
        response(request, true);
      } else if (request.message === "/workflow attach run-a stage-1") {
        send({ type: "engine_custom_open", componentId: "workflow-attach", overlay: false });
        send({ type: "engine_custom_frame", componentId: "workflow-attach", requestId: 1, lines: ["attach run-a stage-1"] });
        response(request, true);
      } else if (request.message === "/workflow resume") {
        send({ type: "engine_session_picker_open", componentId: "workflow-resume", sessions: [{ path: "/tmp/workflow-run.jsonl", name: "run-a", modified: 1, created: 1, messageCount: 1 }], showRenameHint: false });
        response(request, true);
      } else if (request.message.startsWith("/workflow")) {
        response(request, false, undefined, "unsupported workflow prompt");
      } else if (request.message === "/intercom") {
        send({ type: "engine_custom_open", componentId: "intercom-picker", overlay: true });
        send({ type: "engine_custom_frame", componentId: "intercom-picker", requestId: 98, lines: ["Select an intercom session: fixture-peer", "Enter opens compose"] });
        response(request, true);
      } else if (request.message === "open focused frame") {
        send({ type: "engine_custom_open", componentId: "focus-frame", overlay: true, handlesCtrlC: true });
        send({ type: "engine_custom_frame", componentId: "focus-frame", requestId: 1, lines: ["focused frame"] });
        send({ type: "extension_ui_request", id: "fixture-dialog", method: "input", title: "Fixture input", placeholder: "Type here", timeout: 1000 });
        response(request, true);
      } else if (request.message === "open input dialog") {
        send({ type: "extension_ui_request", id: "fixture-dialog", method: "input", title: "Fixture input", placeholder: "Type here", timeout: 1000 });
        response(request, true);
      } else if (request.message === "start background subagent") {
        send({ type: "engine_custom_open", componentId: "subagent-widget-frame", overlay: false, widgetKey: "subagents.async", widgetPlacement: "belowEditor" });
        response(request, true);
      } else {
        send({ type: "agent_start" });
        appendPrompt(request.message);
        send({ type: "message_start", message: { id: current().leaf, role: "assistant", content: [] } });
        send({ type: "message_end", message: { id: current().leaf, role: "assistant", content: [{ type: "text", text: "reply: " + request.message }] } });
        if (request.message === "queue seed") { queues = { steering: ["steer first"], followUp: ["follow first"] }; queueUpdate(); }
        else send({ type: "agent_end" });
        response(request, true);
      }
    }
    else if (request.type === "invoke_shortcut") {
      if (request.key.toLowerCase() === "f2") { openWorkflowGraph(); response(request, true); }
      else if (request.key.toLowerCase() === "alt+m") {
        send({ type: "engine_custom_open", componentId: "intercom-picker", overlay: true });
        send({ type: "engine_custom_frame", componentId: "intercom-picker", requestId: 98, lines: ["Select an intercom session: fixture-peer", "Enter opens compose"] });
        response(request, true);
      } else response(request, false, undefined, "unsupported fixture shortcut: " + request.key);
    }
    else if (request.type === "new_session") response(request, true, { cancelled: true });
    else if (request.type === "clone") response(request, true, { cancelled: true });
    else if (request.type === "switch_session") response(request, true, { cancelled: true });
    else if (request.type === "fork") { active = "fork"; response(request, true, { text: "fork edit", cancelled: false }); }
    else if (request.type === "import_session") { active = "imported"; response(request, true, { cancelled: false }); }
    else if (request.type === "navigate_tree") {
      const session = current();
      if (!session.entries.some((entry) => entry.id === request.targetId)) response(request, false, undefined, "unknown tree entry");
      else { session.leaf = request.targetId; response(request, true, { cancelled: false, editorText: request.targetId === "edit-target" ? "restored draft" : "" }); }
    }
    else if (request.type === "set_label") {
      const node = tree().flatMap(function walk(node) { return [node, ...node.children.flatMap(walk)]; }).find((node) => node.entry.id === request.entryId);
      if (!node) response(request, false, undefined, "unknown tree entry");
      else { if (typeof request.label === "string") labels.set(request.entryId, request.label); else labels.delete(request.entryId); response(request, true); }
    }
    else if (request.type === "compact") {
      const session = current();
      const id = "compact-" + (session.entries.length + 1);
      session.entries.push({ id, parentId: session.leaf, type: "compaction", summary: "fixture boundary", firstKeptEntryId: session.entries[0].id });
      session.leaf = id;
      send({ type: "compaction_end", result: { compactedText: "fixture boundary", firstKeptEntryId: session.entries[0].id, tokensBefore: 12, stats: {}, parameters: {} } });
      response(request, true);
    }
    else response(request, false, undefined, "unsupported fixture command: " + request.type);
  }
});`,
		"utf8",
	);
	return path;
}

function editor(page: Page) {
	return page.locator(".composer-editor .cm-content");
}

async function launchFixture(delayInitialEntries = false): Promise<Page> {
	assert.equal(
		existsSync(electronMain),
		true,
		`Missing built Electron main: ${electronMain}. Run npm run build --workspace=@bastani/atomic-gui.`,
	);
	const fixture = writeProtocolFixture(delayInitialEntries);
	const agentDir = tempDir("atomic-gui-e2e-agent-");
	const cwd = tempDir("atomic-gui-e2e-cwd-");
	const userDataDir = tempDir("atomic-gui-e2e-user-data-");
	app = await _electron.launch({
		args: [electronMain, `--user-data-dir=${userDataDir}`],
		cwd,
		timeout: 15_000,
		env: {
			...process.env,
			ATOMIC_CODING_AGENT_DIR: agentDir,
			ATOMIC_GUI_CLI_ENTRY: fixture,
			ATOMIC_GUI_RUNTIME: process.execPath,
		},
	});
	const page = await app.firstWindow({ timeout: 15_000 });
	await page.getByRole("button", { name: "Start engine" }).click();
	await page.getByText("ready", { exact: true }).waitFor({ timeout: 15_000 });
	return page;
}

afterEach(async () => {
	await app?.close().catch(() => undefined);
	app = undefined;
	for (const path of tempPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

test("Electron fixture E2E: generic background-subagent widget shows runtime status updates", async () => {
	const page = await launchFixture(true);
	await editor(page).click();
	await page.keyboard.type("start background subagent");
	await page.getByRole("button", { name: "Send" }).click();

	const widget = page.locator(".widget-block");
	await widget.getByText("Async agents · background").waitFor();
	await widget.getByText("codebase-analyzer · running").waitFor();
	await widget.getByText("inspecting protocol").waitFor();
	await widget.getByText("codebase-analyzer · complete").waitFor();
	await widget.getByText("inspected protocol").waitFor();
	assert.equal(await page.locator(".widget-block").count(), 1);
}, 30_000);

test("Electron fixture E2E: session switch removes a stale custom subagent widget without engine cleanup", async () => {
	const page = await launchFixture(true);
	await editor(page).click();
	await page.keyboard.type("start background subagent");
	await page.getByRole("button", { name: "Send" }).click();
	await page.locator(".widget-block").getByText("codebase-analyzer · running").waitFor();

	await page.getByRole("button", { name: "Sessions" }).click();
	const dialog = page.getByRole("dialog", { name: "Resume session" });
	await dialog.locator(".session-disposition select").selectOption("root");
	await dialog.getByRole("button", { name: "Fork", exact: true }).click();
	await page.getByText("fork durable prompt").waitFor();
	await page.locator(".widget-block").waitFor({ state: "detached" });
}, 30_000);

test("Electron fixture E2E: cancelled replacement operations keep the live widget", async () => {
	const page = await launchFixture(true);
	await editor(page).click();
	await page.keyboard.type("start background subagent");
	await page.getByRole("button", { name: "Send" }).click();
	const widget = page.locator(".widget-block");
	await widget.getByText("codebase-analyzer · running").waitFor();

	await page.getByRole("button", { name: "Sessions" }).click();
	const dialog = page.getByRole("dialog", { name: "Resume session" });
	await dialog.getByRole("button", { name: "New session" }).click();
	await dialog.waitFor();
	await widget.getByText("codebase-analyzer").waitFor();

	await dialog.getByRole("button", { name: "Clone current" }).click();
	await dialog.waitFor();
	await widget.getByText("codebase-analyzer").waitFor();

	await dialog.getByRole("button", { name: /main · current/ }).click();
	await dialog.waitFor();
	await widget.getByText("codebase-analyzer").waitFor();
}, 30_000);

test("Electron fixture E2E: queue pause, resume, and dequeue render protocol-v2 queues", async () => {
	const page = await launchFixture();
	await editor(page).click();
	await page.keyboard.type("queue seed");
	await page.getByRole("button", { name: "Send" }).click();
	await page.getByRole("button", { name: "steer: steer first" }).waitFor();
	await page.getByRole("button", { name: "followUp: follow first" }).waitFor();
	await page.getByRole("button", { name: "Abort" }).click();
	await page.getByRole("button", { name: "steer: steer first" }).waitFor();

	await editor(page).click();
	await page.keyboard.type("resume marker");
	await page.getByRole("button", { name: "Send" }).click();
	await page.getByText("reply: resume marker").waitFor();
	await page.getByRole("button", { name: "steer: steer first" }).waitFor({ state: "detached" });

	await editor(page).click();
	await page.keyboard.type("queue seed");
	await page.getByRole("button", { name: "Send" }).click();
	await page.getByRole("button", { name: "followUp: follow first" }).click();
	await page.getByRole("button", { name: "followUp: follow first" }).waitFor({ state: "detached" });
	assert.match((await editor(page).textContent()) ?? "", /steer firstfollow first/);
}, 30_000);

test("Electron fixture E2E: fork and import refresh durable active leaves", async () => {
	const page = await launchFixture();
	await page.getByRole("button", { name: "Sessions" }).click();
	const dialog = page.getByRole("dialog", { name: "Resume session" });
	await dialog.locator(".session-disposition select").selectOption("root");
	await dialog.getByRole("button", { name: "Fork", exact: true }).click();
	await page.getByText("fork durable prompt").waitFor();
	assert.match((await editor(page).textContent()) ?? "", /fork edit/);

	await page.getByRole("button", { name: "Sessions" }).click();
	await page.locator('input[placeholder="/path/to/session.jsonl"]').fill("/tmp/import.jsonl");
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: "Import", exact: true }).click();
	await page.getByText("imported durable prompt").waitFor();
	await page.getByRole("button", { name: "Tree" }).click();
	await page.locator(".tree-row.session-row-active").getByText("assistant: imported leaf").waitFor();
	await page.locator(".tree-row.session-row-active").getByRole("button", { name: "Label" }).click();
	await page.getByPlaceholder("Optional label").fill("Pinned");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.getByText("[Pinned] assistant: imported leaf").waitFor();
}, 30_000);

test("Electron fixture E2E: tree navigation restores focus for edit-resubmit and persists compaction", async () => {
	const page = await launchFixture();
	await page.getByRole("button", { name: "Sessions" }).click();
	await page.locator('input[placeholder="/path/to/session.jsonl"]').fill("/tmp/import.jsonl");
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: "Import", exact: true }).click();
	await page.getByText("imported durable prompt").waitFor();

	await page.getByRole("button", { name: "Tree" }).click();
	await page.locator(".tree-select").filter({ hasText: "user: edit target" }).click();
	await page.getByRole("dialog", { name: "Session tree" }).waitFor({ state: "detached" });
	await page.waitForFunction(() => Boolean(document.activeElement?.closest(".composer-editor")));
	assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest(".composer-editor"))), true);
	await page.keyboard.press("ControlOrMeta+A");
	await page.keyboard.type("tree resubmitted");
	await page.keyboard.press("Enter");
	await page.getByText("reply: tree resubmitted").waitFor();

	await page.getByRole("button", { name: "Compact" }).click();
	await page.locator(".context-compaction").getByText("fixture boundary").waitFor();
	await page.getByRole("button", { name: "Tree" }).click();
	await page.locator(".tree-row.session-row-active").getByText("Compaction: fixture boundary").waitFor();
}, 30_000);

test("Electron fixture E2E: native dialog owns focused-frame keys and restores focus", async () => {
	const page = await launchFixture();
	await editor(page).click();
	await page.keyboard.type("open focused frame");
	await page.getByRole("button", { name: "Send" }).click();
	await page.getByText("focused frame").waitFor();
	const dialog = page.getByRole("dialog").filter({ hasText: "Fixture input" });
	await dialog.waitFor();
	const input = dialog.locator("input");
	await input.fill("keyboard only");
	await page.keyboard.press("Escape");
	await dialog.waitFor({ state: "detached" });
	await page.getByText("dialog response").waitFor();
}, 30_000);

test("Electron fixture E2E: MCP OAuth uses the generic frame host and forwards Ctrl+C", async () => {
	const page = await launchFixture();
	await editor(page).click();
	await page.keyboard.type("open MCP OAuth login");
	await page.getByRole("button", { name: "Send" }).click();
	const login = page.getByRole("dialog", { name: "Extension UI" });
	await login.getByText("MCP OAuth · fixture-mcp").waitFor();
	await page.keyboard.press("Control+c");
	await login.getByText("MCP OAuth cancellation received").waitFor();
}, 30_000);

test("Electron fixture E2E: MCP proxy and direct tools use the generic transcript render host", async () => {
	const page = await launchFixture();
	await editor(page).click();
	await page.keyboard.type("use MCP tool");
	await page.getByRole("button", { name: "Send" }).click();
	await page.locator(".role-tool").getByText("mcp").waitFor();
	await page.getByText("MCP tool · mcp").waitFor();
	await page.getByText("MCP fixture result").waitFor();

	await editor(page).click();
	await page.keyboard.type("use direct MCP tool");
	await page.getByRole("button", { name: "Send" }).click();
	await page.locator(".role-tool").getByText("fixture_mcp_lookup").waitFor();
	await page.getByText("MCP tool · fixture_mcp_lookup").waitFor();
}, 30_000);

test("Electron fixture E2E: workflow routes stay on generic prompts and frames", async () => {
	const page = await launchFixture();

	await editor(page).click();
	await page.keyboard.type("/workflow demo");
	await page.getByRole("button", { name: "Send" }).click();
	await page.getByText("Dispatch workflow").waitFor();
	await page.getByLabel("Goal").fill("ship the fixture");
	await page.getByRole("button", { name: "Run" }).click();
	await page.getByText("workflow dispatched").waitFor();

	for (const command of ["/workflow list", "/workflow status"]) {
		await editor(page).click();
		await page.keyboard.type(command);
		await page.getByRole("button", { name: "Send" }).click();
	}
	await page.getByText("workflow list").waitFor();
	await page.getByText("workflow status").waitFor();

	await page.keyboard.press("F2");
	await page.getByText("workflow graph").waitFor();
	await page.getByText("run-a · running").waitFor();
	const dialog = page.getByRole("dialog").filter({ hasText: "Workflow note" });
	await dialog.waitFor();
	await dialog.locator("input").fill("only the dialog sees this");
	await page.keyboard.press("Escape");
	await dialog.waitFor({ state: "detached" });
	await page.keyboard.press("ArrowRight");
	await page.getByText(/workflow graph input/).waitFor();
	await page.keyboard.press("Escape");
	await page.getByText("workflow graph").waitFor({ state: "detached" });

	await editor(page).click();
	await page.keyboard.type("/workflow attach run-a stage-1");
	await page.getByRole("button", { name: "Send" }).click();
	await page.getByText("attach run-a stage-1").waitFor();
	await page.keyboard.press("Enter");
	await page.getByText(/stage attached/).waitFor();
}, 30_000);

test("Electron fixture E2E: Intercom compose frames and independent live receive card use generic contracts", async () => {
	const page = await launchFixture();
	await editor(page).click();
	await page.keyboard.type("/intercom");
	await page.getByRole("button", { name: "Send" }).click();
	await page
		.getByRole("dialog", { name: "Extension UI" })
		.getByText("Select an intercom session: fixture-peer")
		.waitFor();
	await page.keyboard.press("Enter");
	await page.getByRole("dialog", { name: "Extension UI" }).getByText("Compose message to fixture-peer").waitFor();
	await page.keyboard.type("hello peer");
	await page.keyboard.press("Enter");
	await page.getByRole("dialog", { name: "Extension UI" }).waitFor({ state: "detached" });

	const incomingCard = page.getByText("intercom_message", { exact: true });
	await incomingCard.waitFor();
	assert.equal(await incomingCard.count(), 1);
	await page.getByText("**📨 From fixture-peer**").waitFor();
	await page.getByText("Received through the generic host").waitFor();
}, 30_000);

test("Electron fixture E2E: Intercom alt+m opens the generic picker from the focused composer", async () => {
	const page = await launchFixture();
	await editor(page).click();
	await page.keyboard.press("Alt+M");
	await page
		.getByRole("dialog", { name: "Extension UI" })
		.getByText("Select an intercom session: fixture-peer")
		.waitFor();
}, 30_000);
