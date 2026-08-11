import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionTreeNodeInfo } from "../../../shared/ipc";
import { useModalFocus } from "../helpers/modal-focus";

export type TreeRow = SessionTreeNodeInfo & { depth: number; hasChildren: boolean };

const bookkeepingKinds = new Set([
	"session_info",
	"label",
	"model_change",
	"thinking_level_change",
	"context_compaction",
]);

function visibleNodes(nodes: SessionTreeNodeInfo[], leafId?: string | null): SessionTreeNodeInfo[] {
	return nodes.flatMap((node) => {
		const children = visibleNodes(node.children, leafId);
		if (bookkeepingKinds.has(node.kind) && node.id !== leafId) return children;
		return [{ ...node, children }];
	});
}

function flatten(nodes: SessionTreeNodeInfo[], folded: Set<string>, depth = 0, out: TreeRow[] = []): TreeRow[] {
	for (const node of nodes) {
		out.push({ ...node, depth, hasChildren: node.children.length > 0 });
		if (node.children.length > 0 && !folded.has(node.id)) flatten(node.children, folded, depth + 1, out);
	}
	return out;
}

/** Creates searchable rows without hiding matches below a locally folded branch. */
export function treeRows(
	nodes: SessionTreeNodeInfo[],
	leafId: string | null | undefined,
	folded: Set<string>,
	query: string,
): TreeRow[] {
	const visible = visibleNodes(nodes, leafId);
	const needle = query.trim().toLowerCase();
	const full = flatten(visible, new Set());
	if (!needle) return flatten(visible, folded);
	const parents = new Map<string, string | undefined>();
	const matching = new Set<string>();
	for (const row of full) {
		for (const child of row.children) parents.set(child.id, row.id);
		if (`${row.summary} ${row.label ?? ""} ${row.id}`.toLowerCase().includes(needle)) matching.add(row.id);
	}
	for (const id of [leafId, ...matching]) {
		let current = id;
		while (current) {
			matching.add(current);
			current = parents.get(current);
		}
	}
	return full.filter((row) => matching.has(row.id));
}

/** Native tree controls mirror TUI-local folds and route mutations through engine RPC. */
export function TreeNavigator(props: {
	nodes: SessionTreeNodeInfo[];
	leafId?: string | null;
	onClose: () => void;
	onNavigate: (entryId: string) => void;
	onLabel: (entryId: string, label: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [folded, setFolded] = useState<Set<string>>(() => new Set());
	const [editingId, setEditingId] = useState<string | null>(null);
	const [label, setLabel] = useState("");
	const dialogRef = useModalFocus<HTMLDivElement>('input[aria-label="Filter session tree"]', props.onClose);
	const labelInputRef = useRef<HTMLInputElement>(null);
	const filterRef = useRef<HTMLInputElement>(null);
	const rows = useMemo(
		() => treeRows(props.nodes, props.leafId, folded, query),
		[folded, props.leafId, props.nodes, query],
	);

	useEffect(() => {
		if (!editingId) return;
		window.setTimeout(() => labelInputRef.current?.focus(), 0);
	}, [editingId]);
	const toggleFold = (entryId: string): void => {
		setFolded((current) => {
			const next = new Set(current);
			if (next.has(entryId)) next.delete(entryId);
			else next.add(entryId);
			return next;
		});
	};

	return (
		<div className="modal-backdrop">
			<div ref={dialogRef} className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="tree-title">
				<div className="modal-header">
					<h2 id="tree-title">Session tree</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<p className="modal-note">
					Select a point to restore it for edit and resubmit. Folds are local; labels persist in the session.
				</p>
				<input
					ref={filterRef}
					className="modal-input"
					aria-label="Filter session tree"
					placeholder="Filter nodes…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="modal-list">
					{rows.map((row) => (
						<li key={row.id}>
							<div
								className={`tree-row${row.id === props.leafId ? " session-row-active" : ""}`}
								style={{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }}
							>
								{row.hasChildren ? (
									<button
										type="button"
										className="tree-fold"
										aria-label={`${folded.has(row.id) ? "Expand" : "Collapse"} ${row.summary}`}
										onClick={() => toggleFold(row.id)}
									>
										{folded.has(row.id) ? "▸" : "▾"}
									</button>
								) : (
									<span className="tree-fold-placeholder" />
								)}
								<button type="button" className="tree-select" onClick={() => props.onNavigate(row.id)}>
									<span className="session-name">
										{row.label ? `[${row.label}] ` : ""}
										{row.summary}
									</span>
									<span className="session-meta">
										{row.kind}
										{row.id === props.leafId ? " · current" : ""}
									</span>
								</button>
								<button
									type="button"
									className="btn tree-label"
									onClick={() => {
										setEditingId(row.id);
										setLabel(row.label ?? "");
									}}
								>
									Label
								</button>
							</div>
							{editingId === row.id ? (
								<div className="session-rename-row">
									<input
										className="modal-input"
										ref={labelInputRef}
										aria-label={`Label ${row.summary}`}
										value={label}
										placeholder="Optional label"
										onChange={(e) => setLabel(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												props.onLabel(row.id, label);
												setEditingId(null);
											}
										}}
									/>
									<button
										type="button"
										className="btn btn-primary"
										onClick={() => {
											props.onLabel(row.id, label);
											setEditingId(null);
										}}
									>
										Save
									</button>
									<button type="button" className="btn" onClick={() => setEditingId(null)}>
										Cancel
									</button>
								</div>
							) : null}
						</li>
					))}
					{rows.length === 0 ? <li className="modal-empty">No tree nodes</li> : null}
				</ul>
			</div>
		</div>
	);
}
