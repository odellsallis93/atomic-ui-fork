import type { AgentSession } from "../../core/agent-session.ts";
import type { AutocompleteProviderFactory } from "../../core/extensions/ui-types.ts";
import { BUILTIN_SLASH_COMMANDS } from "../../core/slash-commands.ts";
import { AtMentionFallbackAutocompleteProvider } from "../interactive/at-mention-autocomplete.ts";
import {
	type AutocompleteItem,
	type AutocompleteProvider,
	CombinedAutocompleteProvider,
	type SlashCommand,
} from "../interactive/interactive-mode-deps.ts";

export interface RpcAutocompleteSuggestion {
	value: string;
	label: string;
	description?: string;
	text: string;
	cursorOffset: number;
}

function toCursorPosition(text: string, cursorOffset: number): { line: number; column: number } {
	const boundedOffset = Math.max(0, Math.min(cursorOffset, text.length));
	const before = text.slice(0, boundedOffset);
	const lines = before.split("\n");
	return { line: lines.length - 1, column: lines.at(-1)?.length ?? 0 };
}

function toCursorOffset(lines: string[], cursorLine: number, cursorCol: number): number {
	return lines.slice(0, cursorLine).reduce((offset, line) => offset + line.length + 1, 0) + cursorCol;
}

/**
 * Owns the autocomplete chain for one RPC-bound session. Extensions provide the
 * same provider wrappers they would in the terminal; only the resulting
 * serializable choices cross the host boundary.
 */
export class RpcAutocompleteService {
	private readonly session: AgentSession;
	private readonly wrappers: AutocompleteProviderFactory[] = [];
	private readonly requests = new Map<string, AbortController>();

	constructor(session: AgentSession) {
		this.session = session;
	}

	addWrapper(factory: AutocompleteProviderFactory): void {
		this.wrappers.push(factory);
	}

	cancel(queryKey: string): void {
		this.requests.get(queryKey)?.abort();
		this.requests.delete(queryKey);
	}

	async query(
		queryKey: string,
		text: string,
		cursorOffset: number,
	): Promise<{ suggestions: RpcAutocompleteSuggestion[] }> {
		this.cancel(queryKey);
		const controller = new AbortController();
		this.requests.set(queryKey, controller);
		try {
			const provider = this.createProvider();
			const lines = text.split("\n");
			const cursor = toCursorPosition(text, cursorOffset);
			const suggestions = await provider.getSuggestions(lines, cursor.line, cursor.column, {
				signal: controller.signal,
				// Preserve the TUI provider's slash-command branch. `force: true`
				// treats a leading slash as an absolute filesystem path instead.
				force: false,
			});
			if (controller.signal.aborted || suggestions === null) return { suggestions: [] };
			return {
				suggestions: suggestions.items.map((item) => {
					const applied = provider.applyCompletion(lines, cursor.line, cursor.column, item, suggestions.prefix);
					return {
						value: item.value,
						label: item.label,
						...(item.description === undefined ? {} : { description: item.description }),
						text: applied.lines.join("\n"),
						cursorOffset: toCursorOffset(applied.lines, applied.cursorLine, applied.cursorCol),
					};
				}),
			};
		} catch (error) {
			if (controller.signal.aborted) return { suggestions: [] };
			throw error;
		} finally {
			if (this.requests.get(queryKey) === controller) this.requests.delete(queryKey);
		}
	}

	private createProvider(): AutocompleteProvider {
		const commands: SlashCommand[] = [
			...BUILTIN_SLASH_COMMANDS,
			...this.session.promptTemplates.map((command) => ({
				name: command.name,
				...(command.description === undefined ? {} : { description: command.description }),
				...(command.argumentHint === undefined ? {} : { argumentHint: command.argumentHint }),
			})),
			...this.session.extensionRunner.getRegisteredCommands().map((command) => ({
				name: command.invocationName,
				...(command.description === undefined ? {} : { description: command.description }),
				...(command.getArgumentCompletions === undefined
					? {}
					: { getArgumentCompletions: command.getArgumentCompletions }),
			})),
			...this.session.resourceLoader.getSkills().skills.map((skill) => ({
				name: `skill:${skill.name}`,
				description: skill.description,
			})),
		];
		const cwd = this.session.sessionManager.getCwd();
		let provider: AutocompleteProvider = new AtMentionFallbackAutocompleteProvider(
			new CombinedAutocompleteProvider(commands as Array<SlashCommand | AutocompleteItem>, cwd),
			new CombinedAutocompleteProvider(commands as Array<SlashCommand | AutocompleteItem>, cwd, null),
		);
		for (const wrapper of this.wrappers) provider = wrapper(provider);
		return provider;
	}
}
