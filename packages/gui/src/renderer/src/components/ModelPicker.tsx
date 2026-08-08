import { useMemo, useState } from "react";
import type { ModelInfo } from "../../../shared/ipc";

export function ModelPicker(props: {
	models: ModelInfo[];
	currentLabel?: string;
	onClose: () => void;
	onSelect: (model: ModelInfo) => void;
}) {
	const [query, setQuery] = useState("");
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return props.models;
		return props.models.filter((model) =>
			`${model.provider}/${model.id} ${model.name ?? ""}`.toLowerCase().includes(needle),
		);
	}, [props.models, query]);

	return (
		<div className="modal-backdrop">
			<div className="modal modal-wide">
				<div className="modal-header">
					<h2>Select model</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				{props.currentLabel ? <p className="modal-subtitle">Current: {props.currentLabel}</p> : null}
				<input
					className="modal-input"
					placeholder="Search models…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="modal-list">
					{filtered.map((model) => (
						<li key={`${model.provider}/${model.id}`}>
							<button type="button" className="session-row" onClick={() => props.onSelect(model)}>
								<span className="session-name">
									{model.provider}/{model.id}
								</span>
								{model.name ? <span className="session-preview">{model.name}</span> : null}
							</button>
						</li>
					))}
					{filtered.length === 0 ? <li className="modal-empty">No models available</li> : null}
				</ul>
			</div>
		</div>
	);
}
