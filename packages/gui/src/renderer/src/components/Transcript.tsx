import { useLayoutEffect, useRef } from "react";
import { ansiLineToSegments } from "../helpers/ansi";
import { renderMarkdown } from "../helpers/markdown";
import type { TranscriptEntry } from "../store/session-store";

function MarkdownBody({ source }: { source: string }) {
	const ref = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		if (ref.current) ref.current.innerHTML = renderMarkdown(source);
	}, [source]);
	return <div ref={ref} className="entry-body markdown" />;
}

function ToolBody({ entry }: { entry: TranscriptEntry }) {
	if (entry.remoteRenderLines) {
		return (
			<pre className="tool-body">
				{entry.remoteRenderLines.map((line) => (
					<div key={`${entry.id}-${line}`} className="ansi-line">
						{ansiLineToSegments(line).map((segment) => (
							<span
								key={`${entry.id}-${line}-${segment.text}-${segment.fg ?? ""}-${segment.bg ?? ""}`}
								style={{
									color: segment.fg,
									background: segment.bg,
									fontWeight: segment.bold ? 700 : undefined,
									opacity: segment.dim ? 0.65 : undefined,
									textDecoration: segment.underline ? "underline" : undefined,
								}}
							>
								{segment.text}
							</span>
						))}
					</div>
				))}
			</pre>
		);
	}
	return (
		<pre className={`tool-body${entry.kind === "bash" ? " bash-body" : ""}`}>
			{entry.expanded ? entry.text : entry.text.slice(0, 400)}
		</pre>
	);
}

function EntryView({
	entry,
	hideThinking,
	hiddenThinkingLabel,
	onToggle,
}: {
	entry: TranscriptEntry;
	hideThinking: boolean;
	hiddenThinkingLabel: string;
	onToggle: (id: string) => void;
}) {
	if (entry.kind === "compaction" || entry.kind === "branchSummary") {
		return (
			<div className={`compaction ${entry.kind === "branchSummary" ? "branch-summary" : "context-compaction"}`}>
				<strong>{entry.kind === "branchSummary" ? "Branch summary" : "Context compaction"}</strong>
				<div>{entry.text}</div>
			</div>
		);
	}

	const roleClass =
		entry.kind === "user" || entry.kind === "skill"
			? "role-user"
			: entry.kind === "tool"
				? "role-tool"
				: entry.kind === "bash"
					? "role-bash"
					: "role-assistant";
	const label =
		entry.kind === "tool"
			? (entry.toolName ?? "tool")
			: entry.kind === "bash"
				? entry.excludeFromContext
					? "bash !!"
					: "bash !"
				: entry.kind === "custom"
					? (entry.customType ?? "custom")
					: entry.kind === "skill"
						? `skill: ${entry.skillName ?? "skill"}`
						: entry.kind === "user"
							? "you"
							: entry.kind === "system"
								? "system"
								: entry.streaming
									? "atomic ▸"
									: "atomic";

	return (
		<article className={`entry${entry.excludeFromContext ? " dimmed" : ""}`}>
			<div className="entry-meta">
				<span className={roleClass}>{label}</span>
				{entry.kind === "tool" || entry.kind === "bash" ? (
					<button type="button" className="btn" onClick={() => onToggle(entry.id)}>
						{entry.expanded ? "collapse" : "expand"}
					</button>
				) : null}
				{entry.error ? <span style={{ color: "var(--red)" }}>{entry.error}</span> : null}
				{entry.kind === "bash" && entry.bashCancelled ? <span>cancelled</span> : null}
				{entry.kind === "bash" && entry.bashTruncated ? <span>truncated</span> : null}
				{entry.kind === "bash" && entry.bashExitCode !== undefined ? <span>exit {entry.bashExitCode}</span> : null}
				{entry.kind === "bash" && entry.bashFullOutputPath ? (
					<span>full output: {entry.bashFullOutputPath}</span>
				) : null}
			</div>
			{entry.thinking && hideThinking ? <div className="thinking-hidden">{hiddenThinkingLabel}</div> : null}
			{entry.thinking && !hideThinking ? (
				<details className="thinking" open={entry.streaming}>
					<summary>thinking</summary>
					<pre>{entry.thinking}</pre>
				</details>
			) : null}
			{entry.kind === "assistant" ? (
				<MarkdownBody source={entry.text || (entry.streaming ? "…" : "")} />
			) : entry.kind === "tool" || entry.kind === "bash" ? (
				<ToolBody entry={entry} />
			) : entry.kind === "skill" ? (
				<div className="entry-body">
					<details>
						<summary>{entry.skillLocation}</summary>
						<pre>{entry.skillContent}</pre>
					</details>
					{entry.text ? <div>{entry.text}</div> : null}
				</div>
			) : (
				<div className="entry-body">{entry.text}</div>
			)}
		</article>
	);
}

export function Transcript({
	entries,
	hideThinking,
	hiddenThinkingLabel,
	onToggle,
}: {
	entries: TranscriptEntry[];
	hideThinking: boolean;
	hiddenThinkingLabel: string;
	onToggle: (id: string) => void;
}) {
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
				<EntryView
					key={entry.id}
					entry={entry}
					hideThinking={hideThinking}
					hiddenThinkingLabel={hiddenThinkingLabel}
					onToggle={onToggle}
				/>
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
