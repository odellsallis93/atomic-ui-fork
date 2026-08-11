import { useEffect, useState } from "react";
import type { GuiSettingsSnapshot, ThemeSummary } from "../../../shared/ipc";
import { useModalFocus } from "../helpers/modal-focus";

type QueueMode = "all" | "one-at-a-time";

export function SettingsPanel(props: {
	themes: ThemeSummary[];
	currentTheme: string;
	settings?: GuiSettingsSnapshot;
	thinkingLevels: string[];
	currentThinkingLevel?: string;
	onClose: () => void;
	onOpenAuth?: () => void;
	onSelectTheme: (name: string) => void;
	onSetThinkingLevel: (level: string) => void;
	onSetSteeringMode: (mode: QueueMode) => void;
	onSetFollowUpMode: (mode: QueueMode) => void;
	onSetAutoCompaction: (enabled: boolean) => void;
	onSetAutoRetry: (enabled: boolean) => void;
}) {
	const [selected, setSelected] = useState(props.currentTheme);
	const dialogRef = useModalFocus<HTMLDivElement>(undefined, props.onClose);

	useEffect(() => {
		setSelected(props.currentTheme);
	}, [props.currentTheme]);

	return (
		<div className="modal-backdrop">
			<div
				ref={dialogRef}
				className="modal modal-wide"
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-title"
			>
				<div className="modal-header">
					<h2 id="settings-title">Settings</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<section className="settings-section">
					<h3>Theme</h3>
					<label className="settings-label" htmlFor="theme-select">
						Current effective theme
					</label>
					<select
						id="theme-select"
						className="modal-input"
						value={selected}
						onChange={(e) => setSelected(e.target.value)}
					>
						{props.themes.map((theme) => (
							<option key={`${theme.source}:${theme.path}`} value={theme.name}>
								{theme.name} ({theme.source})
							</option>
						))}
					</select>
					<p className="settings-hint">
						Reads the effective `theme` from engine config precedence (global, then project). Applying here
						reloads CSS for this GUI session only; persistent theme mutation is intentionally excluded until
						protocol v2 exposes an engine-owned settings RPC.
						{props.settings?.projectOverridesTheme ? " Project settings override the global theme." : ""}
					</p>
					<button
						type="button"
						className="btn btn-primary"
						onClick={() => props.onSelectTheme(selected)}
						disabled={!selected}
					>
						Apply theme live
					</button>
				</section>

				<section className="settings-section">
					<h3>Engine controls</h3>
					<label className="settings-label" htmlFor="thinking-select">
						Thinking level
					</label>
					<select
						id="thinking-select"
						className="modal-input"
						value={props.currentThinkingLevel ?? ""}
						onChange={(event) => props.onSetThinkingLevel(event.target.value)}
					>
						{props.thinkingLevels.length === 0 ? <option value="">Engine levels unavailable</option> : null}
						{props.thinkingLevels.map((level) => (
							<option key={level} value={level}>
								{level}
							</option>
						))}
					</select>
					<div className="settings-grid">
						<button type="button" className="btn" onClick={() => props.onSetSteeringMode("all")}>
							Steer all queued
						</button>
						<button type="button" className="btn" onClick={() => props.onSetSteeringMode("one-at-a-time")}>
							Steer one-at-a-time
						</button>
						<button type="button" className="btn" onClick={() => props.onSetFollowUpMode("all")}>
							Follow up all queued
						</button>
						<button type="button" className="btn" onClick={() => props.onSetFollowUpMode("one-at-a-time")}>
							Follow up one-at-a-time
						</button>
						<button type="button" className="btn" onClick={() => props.onSetAutoCompaction(true)}>
							Enable auto compaction
						</button>
						<button type="button" className="btn" onClick={() => props.onSetAutoCompaction(false)}>
							Disable auto compaction
						</button>
						<button type="button" className="btn" onClick={() => props.onSetAutoRetry(true)}>
							Enable auto retry
						</button>
						<button type="button" className="btn" onClick={() => props.onSetAutoRetry(false)}>
							Disable auto retry
						</button>
					</div>
					<p className="settings-hint">
						These controls call existing engine RPCs. Codex fast mode has engine settings accessors but no
						protocol v2 RPC, so it remains documented as unavailable in the GUI.
					</p>
				</section>

				<div className="modal-actions">
					{props.onOpenAuth ? (
						<button type="button" className="btn" onClick={props.onOpenAuth}>
							Provider auth
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
