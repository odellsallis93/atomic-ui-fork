import { useMemo, useState } from "react";
import type { SessionListItem } from "../../../shared/ipc";

export function SessionPicker(props: {
	sessions: SessionListItem[];
	onClose: () => void;
	onSelect: (session: SessionListItem) => void;
	onNew: () => void;
}) {
	const [query, setQuery] = useState("");
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return props.sessions;
		return props.sessions.filter((session) => {
			const hay = `${session.name ?? ""} ${session.firstMessage} ${session.cwd}`.toLowerCase();
			return hay.includes(needle);
		});
	}, [props.sessions, query]);

	return (
		<div className="modal-backdrop">
			<div className="modal modal-wide">
				<div className="modal-header">
					<h2>Resume session</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<input
					className="modal-input"
					placeholder="Search sessions…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="modal-list">
					{filtered.map((session) => (
						<li key={session.path}>
							<button type="button" className="session-row" onClick={() => props.onSelect(session)}>
								<span className="session-name">{session.name || session.id}</span>
								<span className="session-meta">
									{new Date(session.modified).toLocaleString()} · {session.messageCount} msgs
								</span>
								<span className="session-preview">{session.firstMessage.slice(0, 120)}</span>
							</button>
						</li>
					))}
					{filtered.length === 0 ? <li className="modal-empty">No sessions found</li> : null}
				</ul>
				<div className="modal-actions">
					<button type="button" className="btn btn-primary" onClick={props.onNew}>
						New session
					</button>
				</div>
			</div>
		</div>
	);
}
