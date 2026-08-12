import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { ModelPicker } from "../src/renderer/src/components/ModelPicker.tsx";
import { AuthPanel } from "../src/renderer/src/components/AuthPanel.tsx";
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
			themes={[{ name: "dark", source: "builtin" }]}
			currentTheme="dark"
			settings={{
				theme: "dark",
				projectOverridesTheme: true,
				fastMode: { chat: true, workflow: false },
				hideThinkingBlock: false,
				steeringMode: "one-at-a-time",
				followUpMode: "one-at-a-time",
				autoCompactionEnabled: true,
				autoRetryEnabled: true,
				modelScopePatterns: ["openai/gpt-*"],
			}}
			thinkingLevels={["off", "low"]}
			currentThinkingLevel="low"
			onClose={() => undefined}
			onReloadSettings={() => undefined}
			onSelectTheme={() => undefined}
			onSetThinkingLevel={() => undefined}
			onSetSteeringMode={() => undefined}
			onSetFollowUpMode={() => undefined}
			onSetAutoCompaction={() => undefined}
			onSetAutoRetry={() => undefined}
			onSetHideThinking={() => undefined}
			onSetFastMode={() => undefined}
			onSetModelScope={() => undefined}
		/>,
	);
	assert.match(html, /validates and persists the selection through the engine/);
	assert.match(html, /Project settings override the global theme/);
	assert.match(html, /Steer one-at-a-time/);
	assert.match(html, /Reload settings/);
	assert.match(html, /Enable auto retry/);
	assert.match(html, /Hide thinking blocks by default/);
	assert.match(html, /Codex fast mode/);
	assert.match(html, /Prioritize chat requests/);
	assert.match(html, /Model cycle scope/);
	assert.match(html, /openai\/gpt-\*/);
});

test("OnboardingPanel gives trust auth model steps without credential display", () => {
	const html = renderToStaticMarkup(
		<OnboardingPanel ready={false} onStart={() => undefined} onTrust={() => undefined} onAuth={() => undefined} onModels={() => undefined} />,
	);
	assert.match(html, /Trust, provider auth, and model selection are resolved by the engine/);
	assert.match(html, /never displays saved\s*credentials/);
	assert.match(html, /Provider auth \(after start\)/);
	assert.match(html, /disabled=""/);
	assert.doesNotMatch(html, /api[_ -]?key\s*[:=]/i);
});

test("AuthPanel only offers engine-supported credential actions", () => {
	const html = renderToStaticMarkup(
		<AuthPanel
			catalog={{
				models: [],
				scopedModels: [],
				apiKeyProviders: [{ id: "api", name: "API Provider" }],
				oauthProviders: [{ id: "oauth", name: "OAuth Provider" }],
				logoutProviders: ["oauth"],
				providers: ["api", "oauth"],
			}}
			onClose={() => undefined}
			onRefresh={() => undefined}
			onLogin={() => undefined}
			onLogout={() => undefined}
			onCancel={() => undefined}
		/>,
	);
	assert.equal((html.match(/API key<\/button>/g) ?? []).length, 1);
	assert.equal((html.match(/OAuth login/g) ?? []).length, 1);
	assert.equal((html.match(/Logout<\/button>/g) ?? []).length, 1);
});
