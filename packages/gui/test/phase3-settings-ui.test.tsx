import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { ModelPicker } from "../src/renderer/src/components/ModelPicker.tsx";
import { OnboardingPanel } from "../src/renderer/src/components/OnboardingPanel.tsx";
import { SettingsPanel } from "../src/renderer/src/components/SettingsPanel.tsx";

test("ModelPicker exposes engine-scoped models without hiding the full catalog", () => {
	const html = renderToStaticMarkup(
		<ModelPicker
			models={[
				{ provider: "openai", id: "gpt", scoped: true, scopedThinkingLevel: "high" },
				{ provider: "anthropic", id: "claude" },
			]}
			currentLabel="openai/gpt"
			onClose={() => undefined}
			onSelect={() => undefined}
		/>,
	);
	assert.match(html, /openai\/gpt · scoped/);
	assert.match(html, /thinking high/);
	assert.match(html, /anthropic\/claude/);
});

test("SettingsPanel documents engine-owned theme mutation and exposes supported RPC controls", () => {
	const html = renderToStaticMarkup(
		<SettingsPanel
			themes={[{ name: "dark", source: "builtin", path: "/theme/dark.json" }]}
			currentTheme="dark"
			settings={{
				theme: "dark",
				path: "/project/.atomic/settings.json",
				exists: true,
				globalPath: "/home/.atomic/agent/settings.json",
				projectPath: "/project/.atomic/settings.json",
				globalExists: true,
				projectExists: true,
				projectOverridesTheme: true,
			}}
			thinkingLevels={["off", "low"]}
			currentThinkingLevel="low"
			onClose={() => undefined}
			onSelectTheme={() => undefined}
			onSetThinkingLevel={() => undefined}
			onSetSteeringMode={() => undefined}
			onSetFollowUpMode={() => undefined}
			onSetAutoCompaction={() => undefined}
			onSetAutoRetry={() => undefined}
		/>,
	);
	assert.match(html, /persistent theme mutation is intentionally excluded/);
	assert.match(html, /Project settings override the global theme/);
	assert.match(html, /Steer one-at-a-time/);
	assert.match(html, /Enable auto retry/);
	assert.match(html, /no protocol v2\s*RPC/);
});

test("OnboardingPanel gives trust auth model steps without credential display", () => {
	const html = renderToStaticMarkup(
		<OnboardingPanel ready={false} onStart={() => undefined} onTrust={() => undefined} onAuth={() => undefined} onModels={() => undefined} />,
	);
	assert.match(html, /Trust, provider auth, and model selection are resolved by the engine/);
	assert.match(html, /never displays saved\s*credentials/);
	assert.doesNotMatch(html, /api[_ -]?key\s*[:=]/i);
});
