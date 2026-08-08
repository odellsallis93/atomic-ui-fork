import { useMemo, useState } from "react";
import type { SessionTreeNodeInfo } from "../../../shared/ipc";

function flatten(
	nodes: SessionTreeNodeInfo[],
	depth = 0,
	out: Array<SessionTreeNodeInfo & { depth: number }> = [],
): Array<SessionTreeNodeInfo & { depth: number }> {
	for (const node of nodes) {
		out.push({ ...node, depth });
		if (node.children.length > 0) flatten(node.children, depth + 1, out);
	}
	return out;
}

export function TreeNavigator(props: {
	nodes: SessionTreeNodeInfo[];
	leafId?: string | null;
	onClose: () => void;
	onNavigate: (entryId: string) => void;
}) {
	const [query, setQuery] = useState("");
	const rows = useMemo(() => {
		const flat = flatten(props.nodes);
		const needle = query.trim().toLowerCase();
		if (!needle) return flat;
		return flat.filter((row) => `${row.summary} ${row.label ?? ""} ${row.id}`.toLowerCase().includes(needle));
	}, [props.nodes, query]);

	return (
		<div className="modal-backdrop">
			<div className="modal modal-wide">
				<div className="modal-header">
					<h2>Session tree</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<input
					className="modal-input"
					placeholder="Filter nodes…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="modal-list">
					{rows.map((row) => (
						<li key={row.id}>
							<button
								type="button"
								className={`session-row${row.id === props.leafId ? " session-row-active" : ""}`}
								style={{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }}
								onClick={() => props.onNavigate(row.id)}
							>
								<span className="session-name">
									{row.label ? `[${row.label}] ` : ""}
									{row.summary}
								</span>
								<span className="session-meta">
									{row.kind}
									{row.id === props.leafId ? " · current" : ""}
								</span>
							</button>
						</li>
					))}
					{rows.length === 0 ? <li className="modal-empty">No tree nodes</li> : null}
				</ul>
			</div>
		</div>
	);
}
