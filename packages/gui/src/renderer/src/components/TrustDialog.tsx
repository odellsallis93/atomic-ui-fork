import type { TrustOption, TrustStatus } from "../../../shared/ipc";

export function TrustDialog(props: {
	status: TrustStatus;
	options: TrustOption[];
	onChoose: (optionId: string) => void;
}) {
	return (
		<div className="modal-backdrop">
			<div className="modal">
				<div className="modal-header">
					<h2>Trust project folder?</h2>
				</div>
				<p className="settings-hint">
					{props.status.cwd}
					<br />
					<br />
					This allows Atomic to load project `.atomic` / `.pi` settings and resources, install missing project
					packages, and execute project extensions.
				</p>
				<ul className="modal-list">
					{props.options.map((option) => (
						<li key={option.id}>
							<button type="button" className="session-row" onClick={() => props.onChoose(option.id)}>
								<span className="session-name">{option.label}</span>
								<span className="session-meta">
									{option.trusted ? "trusted" : "untrusted"}
									{option.persistPath ? " · remembered" : " · session only"}
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
