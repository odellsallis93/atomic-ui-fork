import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngineAutocompleteSuggestion, ExtensionShortcutInfo, PromptImage } from "../../../shared/ipc";
import { canSubmit, filterImageFiles, isFileDrag } from "../helpers/attachments";
import {
	actionForKey,
	collapseLargePaste,
	expandPasteMarkers,
	type KeybindingConfig,
	keyboardShortcut,
} from "../helpers/composer-parity";
import { encodeTerminalKey } from "../helpers/key-encode";
import type { QueueChip, WidgetItem } from "../store/session-store";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";
import { Widgets } from "./Widgets";

type CompletionItem = AutocompleteItem & Pick<EngineAutocompleteSuggestion, "text" | "cursorOffset">;

function isInsertableTerminalText(data: string): boolean {
	return data.length > 0 && !/[\u0000-\u001f\u007f]/.test(data);
}

function shortcutKeyId(event: KeyboardEvent): string | undefined {
	if (event.key === "Control" || event.key === "Alt" || event.key === "Shift" || event.key === "Meta")
		return undefined;
	const specialKeys: Record<string, string> = { Enter: "enter", Escape: "escape", Tab: "tab", " ": "space" };
	const base = specialKeys[event.key] ?? event.key.toLowerCase();
	const modifiers = [
		event.ctrlKey ? "ctrl" : undefined,
		event.shiftKey ? "shift" : undefined,
		event.altKey ? "alt" : undefined,
		event.metaKey ? "super" : undefined,
	].filter((modifier): modifier is string => modifier !== undefined);
	return [...modifiers, base].join("+");
}

function normalizedShortcutKey(key: string): string {
	const parts = key.toLowerCase().split("+");
	const modifiers = new Set<string>(
		parts.filter((part) => part === "ctrl" || part === "shift" || part === "alt" || part === "super"),
	);
	const base = parts.filter((part) => !modifiers.has(part)).join("+");
	return [
		modifiers.has("ctrl") ? "ctrl" : undefined,
		modifiers.has("shift") ? "shift" : undefined,
		modifiers.has("alt") ? "alt" : undefined,
		modifiers.has("super") ? "super" : undefined,
		base,
	]
		.filter((part): part is string => part !== undefined)
		.join("+");
}
export function Composer(props: {
	value: string;
	disabled: boolean;
	working: boolean;
	queue: QueueChip[];
	widgets: WidgetItem[];
	images: PromptImage[];
	keybindings: KeybindingConfig;
	extensionShortcuts: ExtensionShortcutInfo[];
	focusRequest?: number;
	onChange: (value: string, cursorOffset: number) => void;
	onSubmit: (behavior?: "steer" | "followUp", message?: string) => void;
	onAbort: (restoreQueue: boolean) => void;
	onClear: () => void;
	onDequeue: () => void;
	onExternalEditor: (text: string) => void;
	onModelSelect: () => void;
	onModelCycle: (direction: "forward" | "backward") => void;
	onThinkingCycle: () => void;
	onThinkingToggle: () => void;
	onToolsExpand: () => void;
	onExtensionShortcut: (key: string) => void;
	onHistoryUp: () => void;
	onHistoryDown: () => void;
	onAutocomplete: (text: string, cursorOffset: number) => Promise<EngineAutocompleteSuggestion[]>;
	onTerminalInput: (data: string) => Promise<{ consumed: boolean; data?: string }>;
	onPasteImages: (files: File[]) => void;
	onRemoveImage: (index: number) => void;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const propsRef = useRef(props);
	propsRef.current = props;
	const pasteRegistry = useRef(new Map<number, string>());
	const [activeIndex, setActiveIndex] = useState(0);
	const [cursorOffset, setCursorOffset] = useState(props.value.length);
	const [completionItems, setCompletionItems] = useState<EngineAutocompleteSuggestion[]>([]);
	const terminalInputQueue = useRef(Promise.resolve());
	const [draggingImages, setDraggingImages] = useState(false);
	const bashMode = props.value.startsWith("!");
	useEffect(() => {
		let cancelled = false;
		void props.onAutocomplete(props.value, cursorOffset).then((items) => {
			if (!cancelled) setCompletionItems(items);
		});
		return () => {
			cancelled = true;
		};
	}, [cursorOffset, props.onAutocomplete, props.value]);
	const items = useMemo<CompletionItem[]>(
		() =>
			completionItems.map((item) => ({
				id: `${item.label}:${item.value}:${item.cursorOffset}`,
				label: item.label,
				insertText: item.value,
				description: item.description,
				text: item.text,
				cursorOffset: item.cursorOffset,
			})),
		[completionItems],
	);
	const safeActiveIndex = items.length === 0 ? 0 : activeIndex % items.length;
	const applyCompletion = useCallback((item: CompletionItem) => {
		setCursorOffset(item.cursorOffset);
		propsRef.current.onChange(item.text, item.cursorOffset);
	}, []);
	useEffect(() => {
		if (!hostRef.current) return;
		const view = new EditorView({
			parent: hostRef.current,
			state: EditorState.create({
				doc: propsRef.current.value,
				extensions: [
					history(),
					markdown(),
					EditorView.contentAttributes.of({
						"aria-label": "Message Atomic",
						"aria-describedby": "composer-hint",
						"aria-autocomplete": "list",
						"aria-expanded": "false",
					}),
					placeholder("Message Atomic — /commands · @files · !bash"),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					EditorView.updateListener.of((update) => {
						const offset = update.state.selection.main.head;
						if (update.docChanged) propsRef.current.onChange(update.state.doc.toString(), offset);
						if (update.docChanged || update.selectionSet) setCursorOffset(offset);
					}),
					EditorView.theme({ "&": { height: "100%" }, ".cm-gutters": { display: "none" } }),
				],
			}),
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []);
	useEffect(() => {
		const view = viewRef.current;
		if (view && view.state.doc.toString() !== props.value)
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: props.value } });
	}, [props.value]);
	useEffect(() => {
		const content = viewRef.current?.contentDOM;
		if (!content) return;
		const expanded = items.length > 0;
		content.setAttribute("aria-expanded", String(expanded));
		if (!expanded) {
			content.removeAttribute("aria-controls");
			content.removeAttribute("aria-activedescendant");
			return;
		}
		content.setAttribute("aria-controls", "composer-autocomplete");
		content.setAttribute("aria-activedescendant", `composer-autocomplete-option-${safeActiveIndex}`);
	}, [items.length, safeActiveIndex]);
	useEffect(() => {
		if (props.focusRequest) viewRef.current?.focus();
	}, [props.focusRequest]);
	useEffect(() => {
		const applyKeyDown = (event: KeyboardEvent, terminalData: string | undefined): void => {
			if (!(event.target as HTMLElement | null)?.closest(".composer-editor")) return;
			const current = propsRef.current;
			const key = keyboardShortcut(event);
			if (!key) return;
			const action = actionForKey(current.keybindings, key, "composer");
			if (action === "tui.input.tab" && items.length) {
				event.preventDefault();
				const item = items[safeActiveIndex];
				if (item) applyCompletion(item);
				return;
			}
			if (action === "tui.input.submit" && !current.disabled) {
				if (items.length) {
					event.preventDefault();
					const item = items[safeActiveIndex];
					if (item) applyCompletion(item);
					return;
				}
				event.preventDefault();
				current.onSubmit(
					current.working ? "steer" : undefined,
					expandPasteMarkers(current.value, pasteRegistry.current),
				);
				return;
			}
			if (action === "tui.input.newLine" && !current.disabled) {
				event.preventDefault();
				const view = viewRef.current;
				if (view) view.dispatch(view.state.replaceSelection("\n"));
				return;
			}
			if (action === "app.message.followUp" && !current.disabled) {
				event.preventDefault();
				current.onSubmit("followUp", expandPasteMarkers(current.value, pasteRegistry.current));
				return;
			}
			if (action === "app.interrupt") {
				event.preventDefault();
				current.onAbort(true);
				return;
			}
			if (action === "app.clear") {
				event.preventDefault();
				current.onClear();
				return;
			}
			if (action === "app.message.dequeue") {
				event.preventDefault();
				current.onDequeue();
				return;
			}
			if (action === "app.editor.external") {
				event.preventDefault();
				current.onExternalEditor(expandPasteMarkers(current.value, pasteRegistry.current));
				return;
			}
			if (action === "app.model.select") {
				event.preventDefault();
				current.onModelSelect();
				return;
			}
			if (action === "app.model.cycleForward") {
				event.preventDefault();
				current.onModelCycle("forward");
				return;
			}
			if (action === "app.model.cycleBackward") {
				event.preventDefault();
				current.onModelCycle("backward");
				return;
			}
			if (action === "app.thinking.cycle") {
				event.preventDefault();
				current.onThinkingCycle();
				return;
			}
			if (action === "app.thinking.toggle") {
				event.preventDefault();
				current.onThinkingToggle();
				return;
			}
			if (action === "app.tools.expand") {
				event.preventDefault();
				current.onToolsExpand();
				return;
			}
			const shortcutKey = shortcutKeyId(event);
			const extensionShortcut = shortcutKey
				? current.extensionShortcuts.find(
						(candidate) => normalizedShortcutKey(candidate.key) === normalizedShortcutKey(shortcutKey),
					)
				: undefined;
			if (extensionShortcut) {
				event.preventDefault();
				current.onExtensionShortcut(extensionShortcut.key);
				return;
			}
			if (items.length && event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((i) => (i + 1) % items.length);
				return;
			}
			if (items.length && event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((i) => (i - 1 + items.length) % items.length);
				return;
			}
			if (viewRef.current?.state.doc.length === 0 && event.key === "ArrowUp") {
				event.preventDefault();
				current.onHistoryUp();
				return;
			}
			if (viewRef.current?.state.doc.length === 0 && event.key === "ArrowDown") {
				event.preventDefault();
				current.onHistoryDown();
				return;
			}
			if (terminalData && isInsertableTerminalText(terminalData)) {
				const view = viewRef.current;
				if (view) view.dispatch(view.state.replaceSelection(terminalData));
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.target as HTMLElement | null)?.closest(".composer-editor")) return;
			const encoded = encodeTerminalKey(event);
			if (!encoded) {
				applyKeyDown(event, undefined);
				return;
			}
			event.preventDefault();
			terminalInputQueue.current = terminalInputQueue.current
				.then(async () => {
					const result = await propsRef.current.onTerminalInput(encoded);
					if (result.consumed) return;
					const transformed = result.data ?? encoded;
					if (transformed.length === 0) return;
					applyKeyDown(event, transformed);
				})
				.catch(() => {
					// A failed interception must not drop the user's key; preserve the
					// existing local keyboard behavior when the engine is unavailable.
					applyKeyDown(event, encoded);
				});
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [applyCompletion, items, safeActiveIndex]);
	return (
		<section className="composer-region" aria-label="Message composer">
			<Widgets widgets={props.widgets} placement="aboveEditor" />
			{props.queue.length ? (
				<div className="queue-row">
					{props.queue.map((chip) => (
						<button key={chip.id} type="button" className="queue-chip" onClick={props.onDequeue}>
							{chip.behavior}: {chip.text.slice(0, 80)}
						</button>
					))}
				</div>
			) : null}
			<div className="composer">
				<section
					aria-label="Attachment drop area"
					className={`composer-main${draggingImages ? " composer-drop-target" : ""}`}
					onDragEnter={(event) => {
						if (isFileDrag(event.dataTransfer.types)) setDraggingImages(true);
					}}
					onDragOver={(event) => {
						if (isFileDrag(event.dataTransfer.types)) event.preventDefault();
					}}
					onDragLeave={() => setDraggingImages(false)}
					onDrop={(event) => {
						event.preventDefault();
						setDraggingImages(false);
						const files = filterImageFiles(event.dataTransfer.files);
						if (files.length) props.onPasteImages(files);
					}}
				>
					{props.images.length ? (
						<fieldset className="attachment-row">
							<legend className="sr-only">Attached images</legend>
							{props.images.map((image, index) => (
								<button
									key={`${image.mimeType}-${image.data.slice(0, 32)}`}
									type="button"
									className="attachment-chip"
									aria-label={`Remove attached image ${index + 1}`}
									onClick={() => props.onRemoveImage(index)}
								>
									image {index + 1} ×
								</button>
							))}
						</fieldset>
					) : null}
					<Autocomplete
						items={items}
						activeIndex={safeActiveIndex}
						onPick={(item) => {
							const choice = items.find((candidate) => candidate.id === item.id);
							if (choice) applyCompletion(choice);
						}}
					/>
					<div
						ref={hostRef}
						className={`composer-editor${bashMode ? " bash-mode" : ""}`}
						aria-disabled={props.disabled}
						onPaste={(event) => {
							const files = filterImageFiles(event.clipboardData.files);
							if (files.length) {
								event.preventDefault();
								props.onPasteImages(files);
								return;
							}
							const text = event.clipboardData.getData("text/plain");
							if (text.length >= 1000) {
								event.preventDefault();
								const view = viewRef.current;
								if (view)
									view.dispatch(view.state.replaceSelection(collapseLargePaste(text, pasteRegistry.current)));
							}
						}}
					/>
				</section>
				<div className="composer-actions">
					<button
						type="button"
						className="btn btn-primary"
						disabled={!canSubmit(props.value, props.images.length, props.disabled)}
						onClick={() =>
							props.onSubmit(
								props.working ? "steer" : undefined,
								expandPasteMarkers(props.value, pasteRegistry.current),
							)
						}
					>
						{props.working ? "Steer" : "Send"}
					</button>
					<button type="button" className="btn" disabled={!props.working} onClick={() => props.onAbort(false)}>
						Abort
					</button>
				</div>
			</div>
			<Widgets widgets={props.widgets} placement="belowEditor" />
			<div className="hint-row" id="composer-hint">
				<span>{bashMode ? "bash mode (! / !!)" : "Configured keys · / @ complete · Tab paths"}</span>
				<span>Queued messages stay paused until an ordinary submit.</span>
			</div>
		</section>
	);
}
