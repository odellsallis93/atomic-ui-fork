import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { parse as parseYaml } from "yaml";
import { jobBlock, jobSteps, namedStep, readText } from "./workflow-text.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const guiPath = join(root, ".github/workflows/gui.yml");

/**
 * Keep the GUI gate separate from the root result gate. This contract makes the
 * changed-path job explicit without widening the root workflow's required checks
 * or suggesting that one Linux runner covers desktop platforms generally.
 */
test("GUI workflow is a Linux-only changed-path gate", async () => {
	const workflow = await readText(guiPath);
	const parsed = parseYaml(workflow) as { jobs?: Record<string, unknown> };
	assert.deepEqual(Object.keys(parsed.jobs ?? {}), ["gui"]);
	assert.match(workflow, /^ {2}push:\n {4}branches: \[main\]\n {4}paths:/mu);
	assert.match(workflow, /^ {2}pull_request:\n {4}paths:/mu);
	assert.match(workflow, /^ {6}- "packages\/gui\/\*\*"$/mu);
	assert.match(workflow, /^ {6}- "packages\/coding-agent\/docs\/gui\.md"$/mu);
	assert.match(workflow, /^ {6}- "packages\/gui\/docs\/\*\*"$/mu);
	assert.match(workflow, /^ {4}runs-on: blacksmith-4vcpu-ubuntu-2404$/mu);
	for (const path of [
		"packages/coding-agent/src/core/agent-session-runtime.ts",
		"packages/coding-agent/src/utils/interactive-engine-bootstrap.ts",
		"packages/coding-agent/src/utils/interactive-engine-env.ts",
	]) {
		assert.match(workflow, new RegExp(`^\\s+- "${path}"$`, "mu"));
	}
	assert.doesNotMatch(workflow, /^\s+runs-on:.*(?:macos|windows)/imu);
	assert.doesNotMatch(workflow, /id-token:\s*write|NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./u);
});

test("GUI workflow installs Electron and native dependencies before its checks", async () => {
	const workflow = await readText(guiPath);
	const gui = jobBlock(workflow, "gui");
	const steps = jobSteps(gui);
	assert.equal(steps.length, 11, "GUI gate should keep setup and three focused checks explicit");
	for (const name of [
		"Install dependencies",
		"Install Electron binary",
		"Build native binding for GUI smoke",
		"Install Linux Electron runtime dependencies",
		"GUI tests",
		"GUI typecheck",
		"GUI build",
	])
		namedStep(steps, name);
	assert.match(namedStep(steps, "Install dependencies"), /npm ci --ignore-scripts/u);
	assert.match(namedStep(steps, "Install Electron binary"), /node node_modules\/electron\/install\.js/u);
	assert.match(
		namedStep(steps, "Build native binding for GUI smoke"),
		/npm run build --workspace=@bastani\/atomic-natives/u,
	);
	assert.match(namedStep(steps, "Install Linux Electron runtime dependencies"), /xvfb/u);
	assert.match(namedStep(steps, "GUI tests"), /xvfb-run[\s\S]*npm run test:gui/u);
	assert.match(namedStep(steps, "GUI typecheck"), /npm run typecheck:gui/u);
	assert.match(namedStep(steps, "GUI build"), /npm run build --workspace=@bastani\/atomic-gui/u);
	assert.ok(steps.indexOf(namedStep(steps, "GUI tests")) < steps.indexOf(namedStep(steps, "GUI typecheck")));
	assert.ok(steps.indexOf(namedStep(steps, "GUI typecheck")) < steps.indexOf(namedStep(steps, "GUI build")));
});

test("GUI docs keep the Phase 5 boundary and theme behavior source-backed", async () => {
	const readme = await readText(join(root, "packages/gui/README.md"));
	const agentDocs = await readText(join(root, "packages/coding-agent/docs/gui.md"));
	for (const docs of [readme, agentDocs]) {
		assert.match(docs, /Linux x64/iu);
		assert.match(docs, /macOS|Windows/iu);
		assert.match(docs, /packaging|security|accessibility|performance/iu);
		assert.match(docs, /npm run test:gui/iu);
	}
	assert.match(readme, /normal `atomic` TUI neither starts nor requires this package/iu);
	assert.match(readme, /do not force `--no-session`/u);
	assert.match(agentDocs, /Electron receives only the resolved CSS tokens/u);
	assert.match(agentDocs, /arbitrary settings\s+documents and paths remain private to the engine/u);
});

test("coding-agent remains independent of the optional Electron GUI package", async () => {
	const codingAgent = join(root, "packages/coding-agent");
	const manifest = JSON.parse(await readFile(join(codingAgent, "package.json"), "utf8")) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
		assert.equal(dependencies?.electron, undefined);
		assert.equal(dependencies?.["@bastani/atomic-gui"], undefined);
	}

	const sourceFiles = (await readdir(join(codingAgent, "src"), { recursive: true })).filter(
		(entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"),
	);
	for (const relativePath of sourceFiles) {
		const source = await readFile(join(codingAgent, "src", relativePath), "utf8");
		assert.doesNotMatch(
			source,
			/from\s+["'][^"']*(?:@bastani\/atomic-gui|packages\/gui|electron)[^"']*["']/u,
			`${relativePath} must not import the optional GUI host`,
		);
	}
});
