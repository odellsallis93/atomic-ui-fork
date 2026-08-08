import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { QueueChip } from "../store/session-store";

export function Composer(props: {
	value: string;
	disabled: boolean;
	working: boolean;
	queue: QueueChip[];
	onChange: (value: string) => void;
	onSubmit: (behavior?: "steer" | "followUp") => void;
	onAbort: () => void;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const propsRef = useRef(props);
	propsRef.current = props;

	const bashMode = props.value.startsWith("!") || props.value.startsWith("!!");

	useEffect(() => {
		if (!hostRef.current) return;
		const view = new EditorView({
			parent: hostRef.current,
			state: EditorState.create({
				doc: propsRef.current.value,
				extensions: [
					history(),
					markdown(),
					placeholder("Message Atomic — Enter to send, Alt+Enter to follow up while streaming"),
					keymap.of([
						{
							key: "Enter",
							run: () => {
								const current = propsRef.current;
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

	return (
		<section className="composer-region">
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
				<div
					ref={hostRef}
					className={`composer-editor${bashMode ? " bash-mode" : ""}`}
					aria-disabled={props.disabled}
				/>
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
			<div className="hint-row">
				<span>{bashMode ? "bash mode (! / !!)" : "Enter send · Alt+Enter follow-up · Esc abort"}</span>
				<span>ctrl+l model · shift+tab thinking</span>
			</div>
		</section>
	);
}
