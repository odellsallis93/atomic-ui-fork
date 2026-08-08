import { useEffect, useState } from "react";
import type { ThemeSummary } from "../../../shared/ipc";

export function SettingsPanel(props: {
	themes: ThemeSummary[];
	currentTheme: string;
	onClose: () => void;
	onSelectTheme: (name: string) => void;
}) {
	const [selected, setSelected] = useState(props.currentTheme);

	useEffect(() => {
		setSelected(props.currentTheme);
	}, [props.currentTheme]);

	return (
		<div className="modal-backdrop">
			<div className="modal">
				<div className="modal-header">
					<h2>Settings</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<label className="settings-label" htmlFor="theme-select">
					Theme
				</label>
				<select
					id="theme-select"
					className="modal-input"
					value={selected}
					onChange={(e) => setSelected(e.target.value)}
				>
					{props.themes.map((theme) => (
						<option key={theme.name} value={theme.name}>
							{theme.name} ({theme.source})
						</option>
					))}
				</select>
				<p className="settings-hint">
					Writes `theme` to `~/.atomic/agent/settings.json` and applies CSS tokens live. Atomic theme JSON from
					builtins and `~/.atomic/agent/themes/` is supported.
				</p>
				<div className="modal-actions">
					<button
						type="button"
						className="btn btn-primary"
						onClick={() => props.onSelectTheme(selected)}
						disabled={!selected || selected === props.currentTheme}
					>
						Apply theme
					</button>
				</div>
			</div>
		</div>
	);
}
