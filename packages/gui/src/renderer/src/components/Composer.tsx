import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileMentionItem, SlashCommandInfo } from "../../../shared/ipc";
import type { QueueChip, WidgetItem } from "../store/session-store";
import { Autocomplete, type AutocompleteItem } from "./Autocomplete";
import { Widgets } from "./Widgets";

function parseCompletionQuery(text: string): { kind: "slash" | "file" | null; query: string } {
	const slash = text.match(/(?:^|\s)\/([^\s]*)$/);
	if (slash) return { kind: "slash", query: slash[1] ?? "" };
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
	onChange: (value: string) => void;
	onSubmit: (behavior?: "steer" | "followUp") => void;
	onAbort: () => void;
	onHistoryUp: () => void;
	onHistoryDown: () => void;
	onSearchFiles: (query: string) => Promise<FileMentionItem[]>;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const propsRef = useRef(props);
	propsRef.current = props;
	const [activeIndex, setActiveIndex] = useState(0);
	const [fileItems, setFileItems] = useState<FileMentionItem[]>([]);

	const bashMode = props.value.startsWith("!") || props.value.startsWith("!!");
	const completion = parseCompletionQuery(props.value);

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

	const items: AutocompleteItem[] = useMemo(() => {
		if (completion.kind === "slash") {
			const needle = completion.query.toLowerCase();
			return props.commands
				.filter((command) => command.name.toLowerCase().includes(needle))
				.slice(0, 30)
				.map((command) => ({
					id: command.name,
					label: `/${command.name}`,
					description: command.description ?? command.source,
				}));
		}
		if (completion.kind === "file") {
			return fileItems.map((item) => ({
				id: item.path,
				label: `@${item.label}`,
				description: item.path,
			}));
		}
		return [];
	}, [completion.kind, completion.query, fileItems, props.commands]);

	const safeActiveIndex = items.length === 0 ? 0 : activeIndex % items.length;

	const applyCompletion = useCallback((item: AutocompleteItem): void => {
		const text = propsRef.current.value;
		const kind = parseCompletionQuery(text).kind;
		const replaced =
			kind === "slash"
				? text.replace(/(^|\s)\/[^\s]*$/, `$1${item.label} `)
				: text.replace(/(^|\s)@[^\s]*$/, `$1${item.label} `);
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
				<div className="composer-main">
					<Autocomplete items={items} activeIndex={safeActiveIndex} onPick={applyCompletion} />
					<div
						ref={hostRef}
						className={`composer-editor${bashMode ? " bash-mode" : ""}`}
						aria-disabled={props.disabled}
					/>
				</div>
				<div className="composer-actions">
					<button
						type="button"
						className="btn btn-primary"
						disabled={props.disabled || props.value.trim().length === 0}
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
