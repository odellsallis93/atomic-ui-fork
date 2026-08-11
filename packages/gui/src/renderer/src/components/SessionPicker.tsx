import { useEffect, useMemo, useRef, useState } from "react";
import type { ForkMessageInfo, SessionListItem } from "../../../shared/ipc";

type SortKey = "modified" | "created" | "name" | "messages";

export function SessionPicker(props: {
	sessions: SessionListItem[];
	forkMessages: ForkMessageInfo[];
	currentPath?: string;
	onClose: () => void;
	onSelect: (session: SessionListItem) => void;
	onNew: () => void;
	onRefresh: (options: { all: boolean }) => void;
	onRename: (session: SessionListItem, name: string) => void;
	onDelete: (session: SessionListItem) => void;
	onClone: () => void;
	onFork: (entryId: string) => void;
	onImport: (inputPath: string) => void;
	onExport: () => void;
}) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<SortKey>("modified");
	const [allCwds, setAllCwds] = useState(false);
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [forkEntryId, setForkEntryId] = useState("");
	const [importPath, setImportPath] = useState("");
	const dialogRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		searchRef.current?.focus();
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.preventDefault();
				props.onClose();
			}
		};
		const dialog = dialogRef.current;
		dialog?.addEventListener("keydown", onKeyDown);
		return () => dialog?.removeEventListener("keydown", onKeyDown);
	}, [props.onClose]);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const list = needle
			? props.sessions.filter((session) =>
					`${session.name ?? ""} ${session.firstMessage} ${session.cwd} ${session.id}`
						.toLowerCase()
						.includes(needle),
				)
			: [...props.sessions];
		list.sort((a, b) =>
			sort === "created"
				? b.created - a.created
				: sort === "name"
					? (a.name || a.id).localeCompare(b.name || b.id)
					: sort === "messages"
						? b.messageCount - a.messageCount
						: b.modified - a.modified,
		);
		return list;
	}, [props.sessions, query, sort]);

	return (
		<div className="modal-backdrop">
			<div
				ref={dialogRef}
				className="modal modal-wide"
				role="dialog"
				aria-modal="true"
				aria-labelledby="sessions-title"
			>
				<div className="modal-header">
					<h2 id="sessions-title">Resume session</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<div className="session-toolbar">
					<input
						ref={searchRef}
						className="modal-input"
						placeholder="Search sessions…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select
						className="modal-input session-sort"
						value={sort}
						onChange={(e) => setSort(e.target.value as SortKey)}
						aria-label="Sort sessions"
					>
						<option value="modified">Modified</option>
						<option value="created">Created</option>
						<option value="name">Name</option>
						<option value="messages">Messages</option>
					</select>
					<label className="session-all-toggle">
						<input
							type="checkbox"
							checked={allCwds}
							onChange={(e) => {
								const next = e.target.checked;
								setAllCwds(next);
								props.onRefresh({ all: next });
							}}
						/>
						All projects
					</label>
				</div>
				<ul className="modal-list">
					{filtered.map((session) => {
						const active = session.path === props.currentPath;
						const renaming = renamingPath === session.path;
						return (
							<li key={session.path}>
								{renaming ? (
									<div className="session-rename-row">
										<input
											className="modal-input"
											value={renameValue}
											onChange={(e) => setRenameValue(e.target.value)}
											placeholder="Session name"
										/>
										<button
											type="button"
											className="btn btn-primary"
											onClick={() => {
												props.onRename(session, renameValue);
												setRenamingPath(null);
											}}
										>
											Save
										</button>
										<button type="button" className="btn" onClick={() => setRenamingPath(null)}>
											Cancel
										</button>
									</div>
								) : (
									<div className={`session-row-wrap${active ? " session-row-active" : ""}`}>
										<button type="button" className="session-row" onClick={() => props.onSelect(session)}>
											<span className="session-name">
												{session.name || session.id}
												{active ? " · current" : ""}
											</span>
											<span className="session-meta">
												{new Date(session.modified).toLocaleString()} · {session.messageCount} msgs
												{allCwds && session.cwd ? ` · ${session.cwd}` : ""}
											</span>
											<span className="session-preview">{session.firstMessage.slice(0, 120)}</span>
										</button>
										<div className="session-row-actions">
											<button
												type="button"
												className="btn"
												onClick={() => {
													setRenamingPath(session.path);
													setRenameValue(session.name ?? "");
												}}
											>
												Rename
											</button>
											<button
												type="button"
												className="btn btn-danger"
												onClick={() => props.onDelete(session)}
											>
												Delete
											</button>
										</div>
									</div>
								)}
							</li>
						);
					})}
					{filtered.length === 0 ? <li className="modal-empty">No sessions found</li> : null}
				</ul>
				<div className="session-disposition">
					<label>
						Fork from a user message
						<select className="modal-input" value={forkEntryId} onChange={(e) => setForkEntryId(e.target.value)}>
							<option value="">Choose a message…</option>
							{props.forkMessages.map((message) => (
								<option key={message.entryId} value={message.entryId}>
									{message.text.slice(0, 100)}
								</option>
							))}
						</select>
					</label>
					<button type="button" className="btn" disabled={!forkEntryId} onClick={() => props.onFork(forkEntryId)}>
						Fork
					</button>
					<label>
						Import JSONL
						<input
							className="modal-input"
							value={importPath}
							placeholder="/path/to/session.jsonl"
							onChange={(e) => setImportPath(e.target.value)}
						/>
					</label>
					<button
						type="button"
						className="btn"
						disabled={!importPath.trim()}
						onClick={() => props.onImport(importPath.trim())}
					>
						Import
					</button>
				</div>
				<div className="modal-actions">
					<button type="button" className="btn btn-primary" onClick={props.onNew}>
						New session
					</button>
					<button type="button" className="btn" onClick={props.onClone}>
						Clone current
					</button>
					<button type="button" className="btn" onClick={props.onExport}>
						Export HTML
					</button>
				</div>
			</div>
		</div>
	);
}
