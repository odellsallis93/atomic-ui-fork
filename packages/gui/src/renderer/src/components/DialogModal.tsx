import { useState } from "react";
import type { ExtensionUiRequest, ExtensionUiResponse } from "../../../shared/ipc";

function titleOf(request: ExtensionUiRequest): string {
	if ("title" in request && typeof request.title === "string") return request.title;
	return "Dialog";
}

export function DialogModal(props: {
	request: ExtensionUiRequest;
	onRespond: (response: ExtensionUiResponse) => void;
}) {
	const { request } = props;
	const [value, setValue] = useState(
		request.method === "editor" && typeof request.prefill === "string" ? request.prefill : "",
	);

	if (request.method === "confirm") {
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<p>{typeof request.message === "string" ? request.message : ""}</p>
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={() => props.onRespond({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => props.onRespond({ id: request.id, confirmed: true })}
						>
							Confirm
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (request.method === "select" && Array.isArray(request.options)) {
		const options = request.options.filter((option): option is string => typeof option === "string");
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<ul className="modal-list">
						{options.map((option) => (
							<li key={option}>
								<button
									type="button"
									className="btn"
									onClick={() => props.onRespond({ id: request.id, value: option })}
								>
									{option}
								</button>
							</li>
						))}
					</ul>
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={() => props.onRespond({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (request.method === "input" || request.method === "editor") {
		const placeholder =
			request.method === "input" && typeof request.placeholder === "string" ? request.placeholder : undefined;
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					{request.method === "editor" ? (
						<textarea className="modal-input" rows={8} value={value} onChange={(e) => setValue(e.target.value)} />
					) : (
						<input
							className="modal-input"
							placeholder={placeholder}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					)}
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={() => props.onRespond({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => props.onRespond({ id: request.id, value })}
						>
							Submit
						</button>
					</div>
				</div>
			</div>
		);
	}

	return null;
}
