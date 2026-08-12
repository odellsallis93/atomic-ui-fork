import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ansiLineToSegments } from "../helpers/ansi";
import { renderMarkdown } from "../helpers/markdown";
import {
	DEFAULT_ENTRY_HEIGHT,
	getEntryIndexAtOffset,
	isNearTranscriptEnd,
	VirtualWindowLayout,
} from "../helpers/virtual-window";
import type { TranscriptEntry } from "../store/session-store";

function MarkdownBody({ source }: { source: string }) {
	const ref = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		if (ref.current) ref.current.innerHTML = renderMarkdown(source);
	}, [source]);
	return <div ref={ref} className="entry-body markdown" />;
}

function withOccurrenceKeys<T>(items: readonly T[], keyFor: (item: T) => string): Array<{ item: T; key: string }> {
	const occurrences = new Map<string, number>();
	return items.map((item) => {
		const baseKey = keyFor(item);
		const occurrence = occurrences.get(baseKey) ?? 0;
		occurrences.set(baseKey, occurrence + 1);
		return { item, key: `${baseKey}:${occurrence}` };
	});
}

function isUnifiedDiff(text: string): boolean {
	const lines = text.split("\n");
	return (
		lines.some((line) => line.startsWith("@@ ")) &&
		lines.some((line) => line.startsWith("--- ")) &&
		lines.some((line) => line.startsWith("+++ "))
	);
}

function DiffBody({ text }: { text: string }) {
	return (
		<pre className="tool-body diff-body">
			{withOccurrenceKeys(text.split("\n"), (line) => line).map(({ item: line, key }) => (
				<span
					key={key}
					className={
						line.startsWith("+") && !line.startsWith("+++")
							? "diff-add"
							: line.startsWith("-") && !line.startsWith("---")
								? "diff-remove"
								: line.startsWith("@@ ")
									? "diff-hunk"
									: undefined
					}
				>
					{line}
					{"\n"}
				</span>
			))}
		</pre>
	);
}

function ToolBody({ entry }: { entry: TranscriptEntry }) {
	if (entry.remoteRenderLines) {
		return (
			<pre id={`entry-body-${entry.id}`} className="tool-body">
				{withOccurrenceKeys(entry.remoteRenderLines, (line) => line).map(({ item: line, key: lineKey }) => (
					<div key={`${entry.id}-line-${lineKey}`} className="ansi-line">
						{withOccurrenceKeys(ansiLineToSegments(line), (segment) => JSON.stringify(segment)).map(
							({ item: segment, key: segmentKey }) => (
								<span
									key={segmentKey}
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
							),
						)}
					</div>
				))}
			</pre>
		);
	}
	if (entry.kind === "tool" && isUnifiedDiff(entry.text)) return <DiffBody text={entry.text} />;
	return (
		<pre id={`entry-body-${entry.id}`} className={`tool-body${entry.kind === "bash" ? " bash-body" : ""}`}>
			{entry.expanded ? entry.text : entry.text.slice(0, 400)}
		</pre>
	);
}

function ImageAttachments({ entry }: { entry: TranscriptEntry }) {
	if (!entry.images || entry.images.length === 0) return null;
	return (
		<fieldset className="entry-images">
			<legend className="sr-only">Attachments</legend>
			{withOccurrenceKeys(entry.images, (image) => `${image.mimeType}:${image.data}`).map(({ item: image, key }) => (
				<img
					key={key}
					className="entry-image"
					src={`data:${image.mimeType};base64,${image.data}`}
					alt="Attachment"
				/>
			))}
		</fieldset>
	);
}

function EntryView({
	entry,
	hideThinking,
	hiddenThinkingLabel,
	onToggle,
	disclosures,
	onDisclosureToggle,
}: {
	entry: TranscriptEntry;
	hideThinking: boolean;
	hiddenThinkingLabel: string;
	onToggle: (id: string) => void;
	disclosures: ReadonlyMap<string, boolean>;
	onDisclosureToggle: (id: string, open: boolean) => void;
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
		<article className={`entry${entry.excludeFromContext ? " dimmed" : ""}`} aria-label={`${label} message`}>
			<div className="entry-meta">
				<span className={roleClass}>{label}</span>
				{entry.kind === "tool" || entry.kind === "bash" ? (
					<button
						type="button"
						className="btn"
						aria-label={entry.expanded ? "Collapse details" : "Expand details"}
						aria-expanded={entry.expanded}
						aria-controls={`entry-body-${entry.id}`}
						onClick={() => onToggle(entry.id)}
					>
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
				<details
					className="thinking"
					open={disclosures.get(`${entry.id}:thinking`) ?? entry.streaming}
					onToggle={(event) => onDisclosureToggle(`${entry.id}:thinking`, event.currentTarget.open)}
				>
					<summary>Thinking details</summary>
					<pre>{entry.thinking}</pre>
				</details>
			) : null}
			{entry.kind === "assistant" ? (
				<>
					<MarkdownBody source={entry.text || (entry.streaming ? "…" : "")} />
					<ImageAttachments entry={entry} />
				</>
			) : entry.kind === "tool" || entry.kind === "bash" ? (
				<>
					<ToolBody entry={entry} />
					<ImageAttachments entry={entry} />
				</>
			) : entry.kind === "skill" ? (
				<div className="entry-body">
					<details
						open={disclosures.get(`${entry.id}:skill`) ?? false}
						onToggle={(event) => onDisclosureToggle(`${entry.id}:skill`, event.currentTarget.open)}
					>
						<summary>{entry.skillLocation ?? "Skill details"}</summary>
						<pre>{entry.skillContent}</pre>
					</details>
					{entry.text ? <div>{entry.text}</div> : null}
				</div>
			) : (
				<>
					<div className="entry-body">{entry.text}</div>
					<ImageAttachments entry={entry} />
				</>
			)}
		</article>
	);
}

function MeasuredEntry({
	entry,
	index,
	top,
	hideThinking,
	hiddenThinkingLabel,
	onToggle,
	disclosures,
	onDisclosureToggle,
	onMeasure,
}: {
	entry: TranscriptEntry;
	index: number;
	top: number;
	hideThinking: boolean;
	hiddenThinkingLabel: string;
	onToggle: (id: string) => void;
	disclosures: ReadonlyMap<string, boolean>;
	onDisclosureToggle: (id: string, open: boolean) => void;
	onMeasure: (id: string, height: number, index: number) => void;
}) {
	const ref = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const measure = () => onMeasure(entry.id, node.getBoundingClientRect().height, index);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [entry.id, index, onMeasure]);
	return (
		<div
			ref={ref}
			className="transcript-virtual-row"
			data-entry-id={entry.id}
			style={{ transform: `translateY(${top}px)` }}
		>
			<EntryView
				entry={entry}
				hideThinking={hideThinking}
				hiddenThinkingLabel={hiddenThinkingLabel}
				onToggle={onToggle}
				disclosures={disclosures}
				onDisclosureToggle={onDisclosureToggle}
			/>
		</div>
	);
}

export function Transcript({
	entries,
	leafId,
	hideThinking,
	hiddenThinkingLabel,
	onToggle,
}: {
	entries: TranscriptEntry[];
	leafId: string | null;
	hideThinking: boolean;
	hiddenThinkingLabel: string;
	onToggle: (id: string) => void;
}) {
	const scrollerRef = useRef<HTMLElement | null>(null);
	const heights = useRef(new Map<string, number>());
	const layoutRef = useRef<VirtualWindowLayout | null>(null);
	const followRef = useRef(true);
	const previousLeafId = useRef(leafId);
	const disclosures = useRef(new Map<string, boolean>());
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(0);
	const [, setMeasurementVersion] = useState(0);
	const [focusedEntryId, setFocusedEntryId] = useState<string>();
	const ids = useMemo(() => entries.map((entry) => entry.id), [entries]);
	if (!layoutRef.current?.matchesIds(ids)) {
		layoutRef.current = new VirtualWindowLayout(ids, heights.current);
	}
	const virtual = layoutRef.current.getWindow(scrollTop, viewportHeight);
	const anchorIndex = getEntryIndexAtOffset(virtual.offsets, scrollTop);
	const anchorIndexRef = useRef(anchorIndex);
	anchorIndexRef.current = anchorIndex;
	const focusedIndex = focusedEntryId ? ids.indexOf(focusedEntryId) : -1;
	const renderIndices = useMemo(() => {
		const indices = Array.from({ length: virtual.end - virtual.start }, (_, index) => virtual.start + index);
		if (focusedIndex >= 0 && !indices.includes(focusedIndex)) indices.push(focusedIndex);
		return indices;
	}, [focusedIndex, virtual.end, virtual.start]);
	const lastEntry = entries.at(-1);
	const scrollKey = `${entries.length}:${lastEntry?.id ?? ""}:${lastEntry?.text.length ?? 0}:${lastEntry?.streaming ? 1 : 0}`;
	const onMeasure = useCallback((id: string, height: number, entryIndex: number) => {
		const previousHeight = heights.current.get(id) ?? DEFAULT_ENTRY_HEIGHT;
		if (height <= 0 || previousHeight === height) return;
		const scroller = scrollerRef.current;
		if (scroller && !followRef.current && entryIndex < anchorIndexRef.current) {
			scroller.scrollTop += height - previousHeight;
			setScrollTop(scroller.scrollTop);
		}
		heights.current.set(id, height);
		layoutRef.current?.setHeight(id, height);
		setMeasurementVersion((version) => version + 1);
	}, []);
	const onDisclosureToggle = useCallback((id: string, open: boolean) => {
		disclosures.current.set(id, open);
	}, []);

	useLayoutEffect(() => {
		if (previousLeafId.current === leafId) return;
		previousLeafId.current = leafId;
		const liveIds = new Set(ids);
		for (const id of heights.current.keys()) {
			if (!liveIds.has(id)) heights.current.delete(id);
		}
		followRef.current = true;
		const scroller = scrollerRef.current;
		if (scroller) scroller.scrollTop = 0;
		setScrollTop(0);
		setMeasurementVersion((version) => version + 1);
	}, [ids, leafId]);
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const observer = new ResizeObserver(() => setViewportHeight(scroller.clientHeight));
		setViewportHeight(scroller.clientHeight);
		observer.observe(scroller);
		return () => observer.disconnect();
	}, []);
	useLayoutEffect(() => {
		void scrollKey;
		void virtual.totalHeight;
		const scroller = scrollerRef.current;
		if (scroller && followRef.current) {
			scroller.scrollTop = scroller.scrollHeight;
			setScrollTop(scroller.scrollTop);
		}
	}, [scrollKey, virtual.totalHeight]);

	return (
		<section
			ref={scrollerRef}
			className="transcript"
			role="log"
			aria-label="Transcript"
			aria-live="polite"
			aria-relevant="additions text"
			aria-atomic="false"
			onFocusCapture={(event) => {
				const row =
					event.target instanceof Element ? event.target.closest<HTMLElement>(".transcript-virtual-row") : null;
				setFocusedEntryId(row?.dataset.entryId);
			}}
			onScroll={(event) => {
				const node = event.currentTarget;
				followRef.current = isNearTranscriptEnd(node.scrollTop, node.clientHeight, node.scrollHeight);
				setScrollTop(node.scrollTop);
			}}
		>
			{entries.length === 0 ? (
				<div className="empty-state">
					<h1>Atomic</h1>
					<p>Desktop host for the interactive engine. Start the engine, then send a prompt.</p>
				</div>
			) : (
				<div className="transcript-virtualizer" style={{ height: virtual.totalHeight }}>
					{renderIndices.map((index) => {
						const entry = entries[index];
						if (!entry) return null;
						return (
							<MeasuredEntry
								key={entry.id}
								entry={entry}
								index={index}
								top={virtual.offsets[index] ?? 0}
								hideThinking={hideThinking}
								hiddenThinkingLabel={hiddenThinkingLabel}
								onToggle={onToggle}
								disclosures={disclosures.current}
								onDisclosureToggle={onDisclosureToggle}
								onMeasure={onMeasure}
							/>
						);
					})}
				</div>
			)}
		</section>
	);
}
