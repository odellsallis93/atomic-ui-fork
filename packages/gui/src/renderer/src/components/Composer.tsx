import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileMentionItem, PromptImage, SlashCommandInfo } from "../../../shared/ipc";
import { canSubmit, filterImageFiles, isFileDrag } from "../helpers/attachments";
import {
	actionForKey,
	collapseLargePaste,
	expandPasteMarkers,
	keyboardShortcut,
	type KeybindingConfig,
} from "../helpers/composer-parity";
import type { QueueChip, WidgetItem } from "../store/session-store";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";
import { Widgets } from "./Widgets";

type CompletionQuery =
	| { kind: "slash-command"; query: string }
	| { kind: "slash-argument"; commandName: string; query: string }
	| { kind: "file" | "path"; query: string }
	| { kind: null; query: string };
function parseCompletionQuery(text: string): CompletionQuery {
	const argument = text.match(/(?:^|\s)\/([^\s]+)\s+([^\s]*)$/);
	if (argument) return { kind: "slash-argument", commandName: argument[1] ?? "", query: argument[2] ?? "" };
	const slash = text.match(/(?:^|\s)\/([^\s]*)$/);
	if (slash) return { kind: "slash-command", query: slash[1] ?? "" };
	const file = text.match(/(?:^|\s)@([^\s]*)$/);
	if (file) return { kind: "file", query: file[1] ?? "" };
	const path = text.match(/(?:^|\s)(?:\.|~|\/)[^\s]*$/);
	if (path) return { kind: "path", query: path[0].trim() };
	return { kind: null, query: "" };
}
export function Composer(props: {
	value: string;
	disabled: boolean;
	working: boolean;
	queue: QueueChip[];
	commands: SlashCommandInfo[];
	widgets: WidgetItem[];
	images: PromptImage[];
	keybindings: KeybindingConfig;
	focusRequest?: number;
	onChange: (value: string) => void;
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
	onHistoryUp: () => void;
	onHistoryDown: () => void;
	onSearchFiles: (query: string) => Promise<FileMentionItem[]>;
	onSearchCommandCompletions: (
		commandName: string,
		argumentPrefix: string,
	) => Promise<Array<{ value: string; label: string; description?: string }>>;
	onPasteImages: (files: File[]) => void;
	onRemoveImage: (index: number) => void;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const propsRef = useRef(props);
	propsRef.current = props;
	const pasteRegistry = useRef(new Map<number, string>());
	const [activeIndex, setActiveIndex] = useState(0);
	const [fileItems, setFileItems] = useState<FileMentionItem[]>([]);
	const [argumentItems, setArgumentItems] = useState<Array<{ value: string; label: string; description?: string }>>(
		[],
	);
	const [draggingImages, setDraggingImages] = useState(false);
	const bashMode = props.value.startsWith("!");
	const completion = parseCompletionQuery(props.value);
	const commandName = completion.kind === "slash-argument" ? completion.commandName : "";
	useEffect(() => {
		if (completion.kind !== "file" && completion.kind !== "path") return void setFileItems([]);
		let cancelled = false;
		void props.onSearchFiles(completion.query).then((items) => {
			if (!cancelled) setFileItems(items);
		});
		return () => {
			cancelled = true;
		};
	}, [completion.kind, completion.query, props.onSearchFiles]);
	useEffect(() => {
		if (
			completion.kind !== "slash-argument" ||
			!props.commands.find((item) => item.name === commandName)?.hasArgumentCompletions
		)
			return void setArgumentItems([]);
		let cancelled = false;
		void props.onSearchCommandCompletions(commandName, completion.query).then((items) => {
			if (!cancelled) setArgumentItems(items);
		});
		return () => {
			cancelled = true;
		};
	}, [commandName, completion.kind, completion.query, props.commands, props.onSearchCommandCompletions]);
	const items = useMemo<AutocompleteItem[]>(() => {
		if (completion.kind === "slash-command")
			return props.commands
				.filter((item) => item.name.toLowerCase().includes(completion.query.toLowerCase()))
				.slice(0, 30)
				.map((item) => ({
					id: item.name,
					label: `/${item.name}`,
					insertText: `/${item.name}`,
					description: item.description ?? item.source,
				}));
		if (completion.kind === "slash-argument")
			return argumentItems.map((item) => ({
				id: `${commandName}:${item.value}`,
				label: item.label,
				insertText: item.value,
				description: item.description,
			}));
		if (completion.kind === "file" || completion.kind === "path")
			return fileItems.map((item) => ({
				id: item.path,
				label: completion.kind === "file" ? `@${item.label}` : item.label,
				insertText: completion.kind === "file" ? `@${item.label}` : item.label,
				description: item.path,
			}));
		return [];
	}, [argumentItems, commandName, completion.kind, completion.query, fileItems, props.commands]);
	const safeActiveIndex = items.length === 0 ? 0 : activeIndex % items.length;
	const applyCompletion = useCallback((item: AutocompleteItem) => {
		const text = propsRef.current.value;
		const kind = parseCompletionQuery(text).kind;
		const insert = item.insertText ?? item.label;
		propsRef.current.onChange(
			kind === "slash-command"
				? text.replace(/(^|\s)\/[^\s]*$/, `$1${insert} `)
				: kind === "slash-argument"
					? text.replace(/(^|\s)\/([^\s]+)\s+[^\s]*$/, `$1/$2 ${insert} `)
					: kind === "file"
						? text.replace(/(^|\s)@[^\s]*$/, `$1${insert} `)
						: text.replace(/(^|\s)(?:\.|~|\/)[^\s]*$/, `$1${insert} `),
		);
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
					placeholder("Message Atomic — /commands · @files · !bash"),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) propsRef.current.onChange(update.state.doc.toString());
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
		if (props.focusRequest) viewRef.current?.focus();
	}, [props.focusRequest]);
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
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
				event.preventDefault();
				current.onSubmit(
					current.working ? "steer" : undefined,
					expandPasteMarkers(current.value, pasteRegistry.current),
				);
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
			if (!items.length) return;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((i) => (i + 1) % items.length);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((i) => (i - 1 + items.length) % items.length);
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [applyCompletion, items, safeActiveIndex]);
	return (
		<section className="composer-region">
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
				<div
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
									onClick={() => props.onRemoveImage(index)}
								>
									image {index + 1} ×
								</button>
							))}
						</fieldset>
					) : null}
					<Autocomplete items={items} activeIndex={safeActiveIndex} onPick={applyCompletion} />
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
				</div>
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
			<div className="hint-row">
				<span>{bashMode ? "bash mode (! / !!)" : "Configured keys · / @ complete · Tab paths"}</span>
				<span>Queued messages stay paused until an ordinary submit.</span>
			</div>
		</section>
	);
}
