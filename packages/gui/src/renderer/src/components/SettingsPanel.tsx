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
	onReloadSettings: () => void;
	onSelectTheme: (name: string) => void;
	onSetThinkingLevel: (level: string) => void;
	onSetSteeringMode: (mode: QueueMode) => void;
	onSetFollowUpMode: (mode: QueueMode) => void;
	onSetAutoCompaction: (enabled: boolean) => void;
	onSetAutoRetry: (enabled: boolean) => void;
	onSetHideThinking: (enabled: boolean) => void;
	onSetFastMode: (scope: "chat" | "workflow", enabled: boolean) => void;
	onSetModelScope: (patterns: string[]) => void;
}) {
	const [selected, setSelected] = useState(props.currentTheme);
	const [modelScope, setModelScope] = useState(props.settings?.modelScopePatterns.join("\n") ?? "");
	const dialogRef = useModalFocus<HTMLDivElement>(undefined, props.onClose);

	useEffect(() => {
		setSelected(props.currentTheme);
	}, [props.currentTheme]);

	useEffect(() => {
		setModelScope(props.settings?.modelScopePatterns.join("\n") ?? "");
	}, [props.settings?.modelScopePatterns]);

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
							<option key={`${theme.source}:${theme.name}`} value={theme.name}>
								{theme.name} ({theme.source})
							</option>
						))}
					</select>
					<p className="settings-hint">
						Reads the effective `theme` from engine config precedence (global, then project). Applying here
						validates and persists the selection through the engine; Electron receives only the resolved CSS
						tokens.
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
					<button type="button" className="btn" onClick={props.onReloadSettings}>
						Reload settings
					</button>
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
					<label className="settings-label">
						<input
							type="checkbox"
							checked={props.settings?.hideThinkingBlock ?? false}
							onChange={(event) => props.onSetHideThinking(event.target.checked)}
						/>{" "}
						Hide thinking blocks by default
					</label>
					<p className="settings-hint">
						These controls call typed engine RPCs; Electron never writes raw settings JSON.
					</p>
				</section>

				<section className="settings-section">
					<h3>Model cycle scope</h3>
					<label className="settings-label" htmlFor="model-scope-patterns">
						Enabled model patterns (one per line)
					</label>
					<textarea
						id="model-scope-patterns"
						className="modal-input"
						rows={4}
						placeholder="openai/gpt-*\nanthropic/claude-sonnet-*"
						value={modelScope}
						onChange={(event) => setModelScope(event.target.value)}
					/>
					<p className="settings-hint">
						Leave empty to cycle all available models. The engine validates patterns and updates this session's
						model cycle immediately; it persists only the accepted patterns.
					</p>
					<button
						type="button"
						className="btn"
						onClick={() =>
							props.onSetModelScope(
								modelScope
									.split(/[,\n]/)
									.map((pattern) => pattern.trim())
									.filter(Boolean),
							)
						}
					>
						Apply model scope
					</button>
				</section>

				<section className="settings-section">
					<h3>Codex fast mode</h3>
					<label className="settings-label">
						<input
							type="checkbox"
							checked={props.settings?.fastMode.chat ?? false}
							onChange={(event) => props.onSetFastMode("chat", event.target.checked)}
						/>{" "}
						Prioritize chat requests when the configured provider supports it
					</label>
					<label className="settings-label">
						<input
							type="checkbox"
							checked={props.settings?.fastMode.workflow ?? false}
							onChange={(event) => props.onSetFastMode("workflow", event.target.checked)}
						/>{" "}
						Prioritize workflow requests when supported
					</label>
					<p className="settings-hint">The engine validates and persists these settings for the active scope.</p>
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
