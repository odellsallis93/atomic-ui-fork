import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileMentionItem, PromptImage, SlashCommandInfo } from "../../../shared/ipc";
import { canSubmit, filterImageFiles, isFileDrag } from "../helpers/attachments";
import type { QueueChip, WidgetItem } from "../store/session-store";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";
import { Widgets } from "./Widgets";

type CompletionQuery =
	| { kind: "slash-command"; query: string }
	| { kind: "slash-argument"; commandName: string; query: string }
	| { kind: "file"; query: string }
	| { kind: null; query: string };

function parseCompletionQuery(text: string): CompletionQuery {
	const argument = text.match(/(?:^|\s)\/([^\s]+)\s+([^\s]*)$/);
	if (argument) return { kind: "slash-argument", commandName: argument[1] ?? "", query: argument[2] ?? "" };
	const slash = text.match(/(?:^|\s)\/([^\s]*)$/);
	if (slash) return { kind: "slash-command", query: slash[1] ?? "" };
	const file = text.match(/(?:^|\s)@([^\s]*)$/);
	if (file) return { kind: "file", query: file[1] ?? "" };
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
	onChange: (value: string) => void;
	onSubmit: (behavior?: "steer" | "followUp") => void;
	onAbort: () => void;
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
	const [activeIndex, setActiveIndex] = useState(0);
	const [fileItems, setFileItems] = useState<FileMentionItem[]>([]);
	const [argumentItems, setArgumentItems] = useState<Array<{ value: string; label: string; description?: string }>>(
		[],
	);
	const [draggingImages, setDraggingImages] = useState(false);

	const bashMode = props.value.startsWith("!") || props.value.startsWith("!!");
	const completion = parseCompletionQuery(props.value);
	const argumentCommandName = completion.kind === "slash-argument" ? completion.commandName : "";

	useEffect(() => {
		if (completion.kind !== "file") {
			setFileItems([]);
			return;
		}
		let cancelled = false;
		void props.onSearchFiles(completion.query).then((items) => {
			if (!cancelled) setFileItems(items);
		});
		return () => {
			cancelled = true;
		};
	}, [completion.kind, completion.query, props.onSearchFiles]);

	useEffect(() => {
		if (completion.kind !== "slash-argument") {
			setArgumentItems([]);
			return;
		}
		const command = props.commands.find((item) => item.name === argumentCommandName);
		if (!command?.hasArgumentCompletions) {
			setArgumentItems([]);
			return;
		}
		let cancelled = false;
		void props.onSearchCommandCompletions(argumentCommandName, completion.query).then((items) => {
			if (!cancelled) setArgumentItems(items);
		});
		return () => {
			cancelled = true;
		};
	}, [argumentCommandName, completion.kind, completion.query, props.commands, props.onSearchCommandCompletions]);

	const items: AutocompleteItem[] = useMemo(() => {
		if (completion.kind === "slash-command") {
			const needle = completion.query.toLowerCase();
			return props.commands
				.filter((command) => command.name.toLowerCase().includes(needle))
				.slice(0, 30)
				.map((command) => ({
					id: command.name,
					label: `/${command.name}`,
					insertText: `/${command.name}`,
					description: command.description ?? command.source,
				}));
		}
		if (completion.kind === "slash-argument") {
			if (!argumentCommandName) return [];
			return argumentItems.map((item) => ({
				id: `${argumentCommandName}:${item.value}`,
				label: item.label,
				insertText: item.value,
				description: item.description,
			}));
		}
		if (completion.kind === "file") {
			return fileItems.map((item) => ({
				id: item.path,
				label: `@${item.label}`,
				insertText: `@${item.label}`,
				description: item.path,
			}));
		}
		return [];
	}, [argumentCommandName, argumentItems, completion.kind, completion.query, fileItems, props.commands]);

	const safeActiveIndex = items.length === 0 ? 0 : activeIndex % items.length;

	const applyCompletion = useCallback((item: AutocompleteItem): void => {
		const text = propsRef.current.value;
		const kind = parseCompletionQuery(text).kind;
		const insertText = item.insertText ?? item.label;
		const replaced =
			kind === "slash-command"
				? text.replace(/(^|\s)\/[^\s]*$/, `$1${insertText} `)
				: kind === "slash-argument"
					? text.replace(/(^|\s)\/([^\s]+)\s+[^\s]*$/, `$1/$2 ${insertText} `)
					: text.replace(/(^|\s)@[^\s]*$/, `$1${insertText} `);
		propsRef.current.onChange(replaced);
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
					keymap.of([
						{
							key: "Enter",
							run: () => {
								const current = propsRef.current;
								const query = parseCompletionQuery(current.value);
								if (query.kind) return false;
								if (current.working) current.onSubmit("steer");
								else current.onSubmit();
								return true;
							},
						},
						{
							key: "Alt-Enter",
							run: () => {
								propsRef.current.onSubmit("followUp");
								return true;
							},
						},
						{
							key: "Escape",
							run: () => {
								if (propsRef.current.working) propsRef.current.onAbort();
								return true;
							},
						},
						{
							key: "ArrowUp",
							run: () => {
								if (propsRef.current.value.trim().length === 0) {
									propsRef.current.onHistoryUp();
									return true;
								}
								return false;
							},
						},
						{
							key: "ArrowDown",
							run: () => {
								if (propsRef.current.value.trim().length === 0) {
									propsRef.current.onHistoryDown();
									return true;
								}
								return false;
							},
						},
						...defaultKeymap,
						...historyKeymap,
					]),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							propsRef.current.onChange(update.state.doc.toString());
						}
					}),
					EditorView.theme({
						"&": { height: "100%" },
						".cm-gutters": { display: "none" },
					}),
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
		if (!view) return;
		const current = view.state.doc.toString();
		if (current !== props.value) {
			view.dispatch({
				changes: { from: 0, to: current.length, insert: props.value },
			});
		}
	}, [props.value]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			if (items.length === 0) return;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((index) => (index + 1) % items.length);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((index) => (index - 1 + items.length) % items.length);
			} else if (event.key === "Tab" || event.key === "Enter") {
				event.preventDefault();
				const item = items[safeActiveIndex];
				if (item) applyCompletion(item);
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [applyCompletion, items, safeActiveIndex]);

	return (
		<section className="composer-region">
			<Widgets widgets={props.widgets} placement="aboveEditor" />
			{props.queue.length > 0 ? (
				<div className="queue-row">
					{props.queue.map((chip) => (
						<span key={chip.id} className="queue-chip">
							{chip.behavior}: {chip.text.slice(0, 80)}
						</span>
					))}
				</div>
			) : null}
			<div className="composer">
				{/* Drop target is a non-focusable region; keyboard attach uses paste on the editor. */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: file drag-and-drop hit target around the editor */}
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
						if (files.length > 0) props.onPasteImages(files);
					}}
				>
					{props.images.length > 0 ? (
						<fieldset className="attachment-row">
							<legend className="sr-only">Attached images</legend>
							{props.images.map((image, index) => (
								<button
									key={`${image.mimeType}-${image.data.slice(0, 32)}`}
									type="button"
									className="attachment-chip"
									onClick={() => props.onRemoveImage(index)}
									title="Remove image"
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
							if (files.length === 0) return;
							event.preventDefault();
							props.onPasteImages(files);
						}}
					/>
				</div>
				<div className="composer-actions">
					<button
						type="button"
						className="btn btn-primary"
						disabled={!canSubmit(props.value, props.images.length, props.disabled)}
						onClick={() => props.onSubmit(props.working ? "steer" : undefined)}
					>
						{props.working ? "Steer" : "Send"}
					</button>
					<button type="button" className="btn" disabled={!props.working} onClick={props.onAbort}>
						Abort
					</button>
				</div>
			</div>
			<Widgets widgets={props.widgets} placement="belowEditor" />
			<div className="hint-row">
				<span>
					{bashMode ? "bash mode (! / !!)" : "Enter send · Alt+Enter follow-up · Esc abort · / @ complete"}
				</span>
				<span>ctrl+l models · ctrl+p cycle · shift+tab thinking · ctrl+t hide thinking</span>
			</div>
		</section>
	);
}
