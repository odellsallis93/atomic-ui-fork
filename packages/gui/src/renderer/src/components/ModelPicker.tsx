import { useMemo, useState } from "react";
import type { ModelInfo } from "../../../shared/ipc";
import { useModalFocus } from "../helpers/modal-focus";

export function ModelPicker(props: {
	models: ModelInfo[];
	currentLabel?: string;
	onClose: () => void;
	onSelect: (model: ModelInfo) => void;
}) {
	const [query, setQuery] = useState("");
	const dialogRef = useModalFocus<HTMLDivElement>(undefined, props.onClose);
	const ordered = useMemo(
		() => [...props.models].sort((a, b) => Number(b.scoped === true) - Number(a.scoped === true)),
		[props.models],
	);
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return ordered;
		return ordered.filter((model) =>
			`${model.provider}/${model.id} ${model.name ?? ""} ${model.scoped ? "scoped" : ""}`
				.toLowerCase()
				.includes(needle),
		);
	}, [ordered, query]);
	const hasScoped = props.models.some((model) => model.scoped === true);

	return (
		<div className="modal-backdrop">
			<div
				ref={dialogRef}
				className="modal modal-wide"
				role="dialog"
				aria-modal="true"
				aria-labelledby="model-title"
			>
				<div className="modal-header">
					<h2 id="model-title">Select model</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				{props.currentLabel ? <p className="modal-subtitle">Current: {props.currentLabel}</p> : null}
				{hasScoped ? (
					<p className="settings-hint">Scoped models are supplied by the engine and shown first.</p>
				) : null}
				<input
					className="modal-input"
					aria-label="Search models"
					placeholder="Search models…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="modal-list">
					{filtered.map((model) => (
						<li key={`${model.provider}/${model.id}`}>
							<button type="button" className="session-row" onClick={() => props.onSelect(model)}>
								<span className="session-name">
									{model.provider}/{model.id} {model.scoped ? "· scoped" : ""}
								</span>
								{model.name || model.scopedThinkingLevel ? (
									<span className="session-preview">
										{model.name ?? ""}
										{model.scopedThinkingLevel ? ` · thinking ${model.scopedThinkingLevel}` : ""}
									</span>
								) : null}
							</button>
						</li>
					))}
					{filtered.length === 0 ? <li className="modal-empty">No models available</li> : null}
				</ul>
			</div>
		</div>
	);
}
