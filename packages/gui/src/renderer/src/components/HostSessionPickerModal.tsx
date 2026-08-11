import { useMemo, useState } from "react";
import type { HostSessionPickerRow } from "../../../shared/ipc";
import { useModalFocus } from "../helpers/modal-focus";

export function HostSessionPickerModal(props: {
	sessions: HostSessionPickerRow[];
	showRenameHint: boolean;
	errorMessage?: string;
	onClose: () => void;
	onSelect: (path: string) => void;
	onDelete: (path: string) => void;
}) {
	const [query, setQuery] = useState("");
	const dialogRef = useModalFocus<HTMLDivElement>(undefined, props.onClose);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return [...props.sessions];
		return props.sessions.filter((session) => {
			const hay = `${session.name ?? ""} ${session.firstMessage} ${session.cwd} ${session.id}`.toLowerCase();
			return hay.includes(needle);
		});
	}, [props.sessions, query]);

	return (
		<div className="modal-backdrop">
			<div
				ref={dialogRef}
				className="modal modal-wide"
				role="dialog"
				aria-modal="true"
				aria-labelledby="host-sessions-title"
			>
				<div className="modal-header">
					<h2 id="host-sessions-title">Select session</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Cancel
					</button>
				</div>
				{props.showRenameHint ? (
					<p className="settings-hint">
						Rename is available in the built-in TUI resume picker; select a row to continue.
					</p>
				) : null}
				{props.errorMessage ? <p className="banner banner-error">{props.errorMessage}</p> : null}
				<input
					className="modal-input"
					aria-label="Search sessions"
					placeholder="Search sessions…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="modal-list">
					{filtered.map((session) => (
						<li key={session.path}>
							<div className="session-row">
								<button
									type="button"
									className="session-select btn"
									onClick={() => props.onSelect(session.path)}
								>
									<strong>{session.name || session.id}</strong>
									<span className="session-meta">
										{session.messageCount} msgs · {session.cwd}
									</span>
									<span className="session-preview">{session.firstMessage}</span>
								</button>
								<button
									type="button"
									className="btn btn-danger"
									title="Delete session (extension confirms removal)"
									onClick={() => {
										if (window.confirm(`Delete session ${session.name || session.id}?`)) {
											props.onDelete(session.path);
										}
									}}
								>
									Delete
								</button>
							</div>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
