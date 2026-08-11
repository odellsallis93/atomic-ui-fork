export type FocusZone = "composer" | "transcript" | "modal" | "frame";
export type KeybindingConfig = Record<string, string | string[]>;

/** Engine defaults used only until its effective keybinding state arrives. */
export const DEFAULT_COMPOSER_BINDINGS: KeybindingConfig = {
	"app.interrupt": "escape",
	"app.clear": "ctrl+c",
	"app.editor.external": "ctrl+g",
	"app.message.followUp": "alt+enter",
	"app.message.dequeue": "alt+up",
	"app.model.select": "ctrl+l",
	"app.model.cycleForward": "ctrl+p",
	"app.model.cycleBackward": "ctrl+shift+p",
	"app.thinking.cycle": "shift+tab",
	"app.thinking.toggle": "ctrl+t",
	"app.tools.expand": "ctrl+o",
	"tui.input.submit": "enter",
	"tui.input.newLine": "shift+enter",
	"tui.input.tab": "tab",
};

export function normalizeShortcut(key: string): string {
	const parts = key.toLowerCase().split("+");
	const modifiers = new Set(parts.filter((part) => ["ctrl", "shift", "alt", "super"].includes(part)));
	const base = parts.filter((part) => !modifiers.has(part)).join("+");
	return ["ctrl", "shift", "alt", "super"]
		.filter((part) => modifiers.has(part))
		.concat(base)
		.filter(Boolean)
		.join("+");
}

export function matchesBinding(bindings: KeybindingConfig, action: string, key: string): boolean {
	const values = bindings[action] ?? DEFAULT_COMPOSER_BINDINGS[action] ?? [];
	return (Array.isArray(values) ? values : [values]).some(
		(value) => normalizeShortcut(value) === normalizeShortcut(key),
	);
}

export function actionForKey(bindings: KeybindingConfig, key: string, zone: FocusZone): string | undefined {
	const actions =
		zone === "composer"
			? [
					"app.interrupt",
					"app.clear",
					"app.editor.external",
					"app.message.followUp",
					"app.message.dequeue",
					"app.model.select",
					"app.model.cycleForward",
					"app.model.cycleBackward",
					"app.thinking.cycle",
					"app.thinking.toggle",
					"app.tools.expand",
					"tui.input.submit",
					"tui.input.tab",
				]
			: zone === "transcript"
				? [
						"app.model.select",
						"app.model.cycleForward",
						"app.model.cycleBackward",
						"app.thinking.cycle",
						"app.thinking.toggle",
						"app.tools.expand",
					]
				: [];
	return actions.find((action) => matchesBinding(bindings, action, key));
}

export const LARGE_PASTE_THRESHOLD = 1_000;
const marker = /^\[paste #(\d+) (\d+) chars\]$/;

export function collapseLargePaste(text: string, pastes: Map<number, string>): string {
	if (text.length < LARGE_PASTE_THRESHOLD) return text;
	const id = pastes.size + 1;
	pastes.set(id, text);
	return `[paste #${id} ${text.length} chars]`;
}

export function expandPasteMarkers(text: string, pastes: ReadonlyMap<number, string>): string {
	return text.replace(/\[paste #(\d+) (\d+) chars\]/g, (value, id) => {
		const pasted = pastes.get(Number(id));
		return pasted === undefined ? value : pasted;
	});
}

export function isPasteMarker(text: string): boolean {
	return marker.test(text);
}

export function restoreQueuedDraft(queued: readonly string[], current: string): string {
	return [...queued, ...(current.length > 0 ? [current] : [])].join("\n\n");
}

/** Keep an unsent expanded draft ahead of text typed while its request was pending. */
export function restoreFailedDraft(draft: string, current: string): string {
	if (draft.length === 0) return current;
	return current.length === 0 ? draft : `${draft}\n\n${current}`;
}

/** Browser keys use names that differ from the engine keybinding vocabulary. */
export function keyboardShortcut(
	event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">,
): string | undefined {
	if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return undefined;
	const special: Record<string, string> = {
		ArrowDown: "down",
		ArrowUp: "up",
		Enter: "enter",
		Escape: "escape",
		Tab: "tab",
		" ": "space",
	};
	const base = special[event.key] ?? event.key.toLowerCase();
	return [event.ctrlKey && "ctrl", event.shiftKey && "shift", event.altKey && "alt", event.metaKey && "super", base]
		.filter(Boolean)
		.join("+");
}
