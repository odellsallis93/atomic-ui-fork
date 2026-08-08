import { useLayoutEffect, useRef } from "react";
import { renderMarkdown } from "../lib/markdown";
import type { TranscriptEntry } from "../store/session-store";

function MarkdownBody({ source }: { source: string }) {
	const ref = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		if (ref.current) ref.current.innerHTML = renderMarkdown(source);
	}, [source]);
	return <div ref={ref} className="entry-body markdown" />;
}

function EntryView({ entry, onToggle }: { entry: TranscriptEntry; onToggle: (id: string) => void }) {
	if (entry.kind === "compaction" || entry.kind === "branchSummary") {
		return <div className="compaction">{entry.text}</div>;
	}

	const roleClass = entry.kind === "user" ? "role-user" : entry.kind === "tool" ? "role-tool" : "role-assistant";
	const label =
		entry.kind === "tool"
			? (entry.toolName ?? "tool")
			: entry.kind === "user"
				? "you"
				: entry.streaming
					? "atomic ▸"
					: "atomic";

	return (
		<article className="entry">
			<div className="entry-meta">
				<span className={roleClass}>{label}</span>
				{entry.kind === "tool" ? (
					<button type="button" className="btn" onClick={() => onToggle(entry.id)}>
						{entry.expanded ? "collapse" : "expand"}
					</button>
				) : null}
				{entry.error ? <span style={{ color: "var(--red)" }}>{entry.error}</span> : null}
			</div>
			{entry.thinking ? (
				<details className="thinking">
					<summary>thinking</summary>
					<pre>{entry.thinking}</pre>
				</details>
			) : null}
			{entry.kind === "assistant" ? (
				<MarkdownBody source={entry.text || (entry.streaming ? "…" : "")} />
			) : entry.kind === "tool" ? (
				<pre className="tool-body">{entry.expanded ? entry.text : entry.text.slice(0, 400)}</pre>
			) : (
				<div className="entry-body">{entry.text}</div>
			)}
		</article>
	);
}

export function Transcript({ entries, onToggle }: { entries: TranscriptEntry[]; onToggle: (id: string) => void }) {
	const lastEntry = entries.at(-1);
	const scrollKey = `${entries.length}:${lastEntry?.id ?? ""}:${lastEntry?.text.length ?? 0}:${lastEntry?.streaming ? 1 : 0}`;

	if (entries.length === 0) {
		return (
			<section className="transcript">
				<div className="empty-state">
					<h1>Atomic</h1>
					<p>Desktop host for the interactive engine. Start the engine, then send a prompt.</p>
				</div>
			</section>
		);
	}

	return (
		<section className="transcript" aria-label="Transcript">
			{entries.map((entry) => (
				<EntryView key={entry.id} entry={entry} onToggle={onToggle} />
			))}
			<div
				key={scrollKey}
				ref={(node) => {
					node?.scrollIntoView({ block: "end" });
				}}
			/>
		</section>
	);
}
