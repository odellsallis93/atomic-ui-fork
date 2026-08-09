import { useState } from "react";
import type { InputFormRequest } from "../../../shared/ipc";

export function InputFormModal(props: {
	request: InputFormRequest;
	onSubmit: (values: Record<string, string>) => void;
	onCancel: () => void;
}) {
	const [values, setValues] = useState<Record<string, string>>(() => {
		const initial: Record<string, string> = {};
		for (const field of props.request.fields) initial[field.name] = field.initialValue;
		return initial;
	});

	return (
		<div className="modal-backdrop">
			<div className="modal">
				<div className="modal-header">
					<h2>{props.request.heading ?? props.request.title}</h2>
				</div>
				{props.request.heading ? <p className="settings-hint">{props.request.title}</p> : null}
				{props.request.fields.map((field) => (
					<label key={field.name} className="settings-label" htmlFor={`field-${field.name}`}>
						{field.description ?? field.name}
						{field.choices && field.choices.length > 0 ? (
							<select
								id={`field-${field.name}`}
								className="modal-input"
								value={values[field.name] ?? ""}
								onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
							>
								{field.choices.map((choice) => (
									<option key={choice} value={choice}>
										{choice}
									</option>
								))}
							</select>
						) : (
							<input
								id={`field-${field.name}`}
								className="modal-input"
								type={
									field.type === "string" && /key|token|secret|password/i.test(field.name)
										? "password"
										: "text"
								}
								placeholder={field.placeholder}
								value={values[field.name] ?? ""}
								onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
							/>
						)}
					</label>
				))}
				<div className="modal-actions">
					<button type="button" className="btn" onClick={props.onCancel}>
						Cancel
					</button>
					<button type="button" className="btn btn-primary" onClick={() => props.onSubmit(values)}>
						{props.request.submitLabel ?? "Submit"}
					</button>
				</div>
			</div>
		</div>
	);
}
