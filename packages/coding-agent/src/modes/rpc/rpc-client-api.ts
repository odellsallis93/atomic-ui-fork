import { randomUUID } from "node:crypto";
import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Credential } from "@earendil-works/pi-ai";
import type { Api, ImageContent, Model } from "@earendil-works/pi-ai/compat";
import type { SessionStats } from "../../core/agent-session.ts";
import type { BashResult } from "../../core/bash-executor.ts";
import type { VerbatimCompactionResult } from "../../core/compaction/index.ts";
import type { AtomicProviderCompat } from "../../core/model-capabilities.ts";
import type { SessionEntry, SessionTreeNode } from "../../core/session-manager.ts";
import type {
	RpcAutocompleteItem,
	RpcAutocompleteSuggestion,
	RpcCommand,
	RpcLoginProviderResult,
	RpcLogoutProviderResult,
	RpcModelCatalog,
	RpcModelRefreshResult,
	RpcProjectTrustOption,
	RpcProjectTrustStatus,
	RpcResolvedThemeSnapshot,
	RpcResponse,
	RpcSessionState,
	RpcSettingsOperation,
	RpcSettingsSnapshot,
	RpcSlashCommand,
	RpcThemeSummary,
} from "./rpc-types.ts";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type RpcCommandBody = DistributiveOmit<RpcCommand, "id">;

export interface ModelInfo {
	provider: string;
	id: string;
	contextWindow: number;
	reasoning: boolean;
	/** Provider/model capability metadata used to gate constrained sampling. */
	compat?: AtomicProviderCompat;
}

export interface RpcSessionListItem {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	modified: number;
	created: number;
	messageCount: number;
	firstMessage: string;
	internal?: boolean;
}

export abstract class RpcClientApi {
	protected abstract request(command: RpcCommandBody): Promise<RpcResponse>;
	protected abstract data<T>(response: RpcResponse): T;

	async prompt(message: string, images?: ImageContent[], streamingBehavior?: "steer" | "followUp"): Promise<void> {
		await this.request({ type: "prompt", message, images, streamingBehavior });
	}
	async steer(message: string, images?: ImageContent[]): Promise<void> {
		await this.request({ type: "steer", message, images });
	}
	async followUp(message: string, images?: ImageContent[]): Promise<void> {
		await this.request({ type: "follow_up", message, images });
	}
	async abort(): Promise<void> {
		await this.request({ type: "abort" });
	}
	async newSession(parentSession?: string): Promise<{ cancelled: boolean }> {
		return this.data(await this.request({ type: "new_session", parentSession }));
	}
	async getState(): Promise<RpcSessionState> {
		return this.data(await this.request({ type: "get_state" }));
	}
	async getSettingsSnapshot(): Promise<RpcSettingsSnapshot> {
		return this.data(await this.request({ type: "get_settings_snapshot" }));
	}
	async reloadSettings(): Promise<RpcSettingsSnapshot> {
		return this.data(await this.request({ type: "reload_settings" }));
	}
	async listThemes(): Promise<RpcThemeSummary[]> {
		return this.data<{ themes: RpcThemeSummary[] }>(await this.request({ type: "list_themes" })).themes;
	}
	async getThemeSnapshot(name?: string): Promise<RpcResolvedThemeSnapshot> {
		return this.data(await this.request({ type: "get_theme_snapshot", name }));
	}
	async setTheme(name: string): Promise<RpcResolvedThemeSnapshot> {
		return this.data(await this.request({ type: "set_theme", name }));
	}
	async setFastMode(scope: "chat" | "workflow", enabled: boolean): Promise<RpcSettingsSnapshot> {
		return this.data(await this.request({ type: "set_fast_mode", scope, enabled }));
	}
	async updateSettings(operations: RpcSettingsOperation[]): Promise<RpcSettingsSnapshot> {
		return this.data(await this.request({ type: "update_settings", operations }));
	}
	async getExternalEditorCommand(): Promise<string> {
		return this.data<{ command: string }>(await this.request({ type: "get_external_editor_command" })).command;
	}
	async getProjectTrust(): Promise<RpcProjectTrustStatus> {
		return this.data(await this.request({ type: "get_project_trust" }));
	}
	async getProjectTrustOptions(): Promise<RpcProjectTrustOption[]> {
		return this.data<{ options: RpcProjectTrustOption[] }>(await this.request({ type: "get_project_trust_options" }))
			.options;
	}
	async setProjectTrust(
		optionId: RpcProjectTrustOption["id"],
	): Promise<{ status: RpcProjectTrustStatus; sessionOnly?: boolean }> {
		return this.data(await this.request({ type: "set_project_trust", optionId }));
	}
	async setModel(provider: string, modelId: string): Promise<{ provider: string; id: string }> {
		return this.data(await this.request({ type: "set_model", provider, modelId }));
	}
	async cycleModel(direction?: "forward" | "backward"): Promise<{
		model: Model<Api>;
		thinkingLevel: ThinkingLevel;
		isScoped: boolean;
	} | null> {
		return this.data(await this.request({ type: "cycle_model", direction }));
	}
	async getAvailableModels(): Promise<ModelInfo[]> {
		return this.data<{ models: ModelInfo[] }>(await this.request({ type: "get_available_models" })).models;
	}
	async loginProvider(provider: string, signal?: AbortSignal): Promise<RpcLoginProviderResult> {
		const loginId = randomUUID();
		if (signal?.aborted) return { provider, cancelled: true };
		const cancel = () => {
			void this.cancelLoginProvider(provider, loginId).catch(() => {});
		};
		signal?.addEventListener("abort", cancel, { once: true });
		try {
			return this.data(await this.request({ type: "login_provider", provider, loginId }));
		} finally {
			signal?.removeEventListener("abort", cancel);
		}
	}
	async saveProviderCredential(provider: string, credential: Credential): Promise<RpcModelCatalog> {
		return this.data(await this.request({ type: "save_provider_credential", provider, credential }));
	}
	async cancelLoginProvider(provider: string, loginId?: string): Promise<void> {
		await this.request({ type: "cancel_login_provider", provider, loginId });
	}
	async logoutProvider(provider: string): Promise<RpcLogoutProviderResult> {
		return this.data(await this.request({ type: "logout_provider", provider }));
	}

	async refreshModels(
		options: { timeoutMs?: number; force?: boolean; allowNetwork?: boolean } = {},
	): Promise<RpcModelRefreshResult> {
		return this.data(await this.request({ type: "refresh_models", ...options }));
	}
	async setThinkingLevel(level: ThinkingLevel): Promise<void> {
		await this.request({ type: "set_thinking_level", level });
	}
	async cycleThinkingLevel(): Promise<{ level: ThinkingLevel } | null> {
		return this.data(await this.request({ type: "cycle_thinking_level" }));
	}
	async getAvailableThinkingLevels(): Promise<ThinkingLevel[]> {
		return this.data<{ levels: ThinkingLevel[] }>(await this.request({ type: "get_available_thinking_levels" }))
			.levels;
	}
	async setSteeringMode(mode: "all" | "one-at-a-time"): Promise<void> {
		await this.request({ type: "set_steering_mode", mode });
	}
	async setFollowUpMode(mode: "all" | "one-at-a-time"): Promise<void> {
		await this.request({ type: "set_follow_up_mode", mode });
	}
	async compact(): Promise<VerbatimCompactionResult> {
		return this.data(await this.request({ type: "compact" }));
	}
	async setAutoCompaction(enabled: boolean): Promise<void> {
		await this.request({ type: "set_auto_compaction", enabled });
	}
	async setAutoRetry(enabled: boolean): Promise<void> {
		await this.request({ type: "set_auto_retry", enabled });
	}
	async abortRetry(): Promise<void> {
		await this.request({ type: "abort_retry" });
	}
	async bash(command: string): Promise<BashResult> {
		return this.data(await this.request({ type: "bash", command }));
	}
	async abortBash(requestId?: string): Promise<void> {
		await this.request({ type: "abort_bash", requestId });
	}
	async getSessionStats(): Promise<SessionStats> {
		return this.data(await this.request({ type: "get_session_stats" }));
	}
	async listSessions(
		options: { cwd?: string; all?: boolean; includeInternal?: boolean; offset?: number; limit?: number } = {},
	): Promise<{ sessions: RpcSessionListItem[]; total: number; nextOffset: number | null }> {
		return this.data(await this.request({ type: "list_sessions", ...options }));
	}
	async exportHtml(outputPath?: string): Promise<{ path: string }> {
		return this.data(await this.request({ type: "export_html", outputPath }));
	}
	async shareSession(): Promise<{ gistUrl: string; shareUrl: string }> {
		return this.data(await this.request({ type: "share_session" }));
	}
	async deleteSession(sessionPath: string): Promise<void> {
		await this.request({ type: "delete_session", sessionPath });
	}
	async renameSession(sessionPath: string, name: string): Promise<void> {
		await this.request({ type: "rename_session", sessionPath, name });
	}
	async switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
		return this.data(await this.request({ type: "switch_session", sessionPath }));
	}
	async fork(entryId: string): Promise<{ text: string; cancelled: boolean }> {
		return this.data(await this.request({ type: "fork", entryId }));
	}
	async clone(): Promise<{ cancelled: boolean }> {
		return this.data(await this.request({ type: "clone" }));
	}
	async getForkMessages(): Promise<Array<{ entryId: string; text: string }>> {
		return this.data<{ messages: Array<{ entryId: string; text: string }> }>(
			await this.request({ type: "get_fork_messages" }),
		).messages;
	}
	async getEntries(since?: string): Promise<{ entries: SessionEntry[]; leafId: string | null }> {
		return this.data(await this.request({ type: "get_entries", since }));
	}
	async getTree(): Promise<{ tree: SessionTreeNode[]; leafId: string | null }> {
		return this.data(await this.request({ type: "get_tree" }));
	}
	async getLastAssistantText(): Promise<string | null> {
		return this.data<{ text: string | null }>(await this.request({ type: "get_last_assistant_text" })).text;
	}
	async setSessionName(name: string): Promise<void> {
		await this.request({ type: "set_session_name", name });
	}
	async getMessages(): Promise<AgentMessage[]> {
		return this.data<{ messages: AgentMessage[] }>(await this.request({ type: "get_messages" })).messages;
	}
	async getCommands(): Promise<RpcSlashCommand[]> {
		return this.data<{ commands: RpcSlashCommand[] }>(await this.request({ type: "get_commands" })).commands;
	}
	async getCommandCompletions(commandName: string, argumentPrefix: string): Promise<RpcAutocompleteItem[] | null> {
		return this.data<{ completions: RpcAutocompleteItem[] | null }>(
			await this.request({ type: "get_command_completions", commandName, argumentPrefix }),
		).completions;
	}
	async autocompleteQuery(queryKey: string, text: string, cursorOffset: number): Promise<RpcAutocompleteSuggestion[]> {
		return this.data<{ suggestions: RpcAutocompleteSuggestion[] }>(
			await this.request({ type: "autocomplete_query", queryKey, text, cursorOffset }),
		).suggestions;
	}
	async cancelAutocompleteQuery(queryKey: string): Promise<void> {
		await this.request({ type: "cancel_autocomplete_query", queryKey });
	}
	async interceptTerminalInput(data: string): Promise<{ consumed: boolean; data?: string }> {
		return this.data(await this.request({ type: "intercept_terminal_input", data }));
	}
}
