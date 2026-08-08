import { useState } from "react";
import type { ExtensionUiRequest, ExtensionUiResponse } from "../../../shared/ipc";

function titleOf(request: ExtensionUiRequest): string {
	if ("title" in request && typeof request.title === "string") return request.title;
	if (request.method.startsWith("oauth_")) return `OAuth · ${"provider" in request ? String(request.provider) : ""}`;
	return "Dialog";
}

export function DialogModal(props: {
	request: ExtensionUiRequest;
	onRespond: (response: ExtensionUiResponse) => void;
	onDismiss?: () => void;
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

	if (request.method === "oauth_select" && request.prompt && typeof request.prompt === "object") {
		const prompt = request.prompt as { message?: string; options?: Array<{ id: string; label: string }> };
		const options = Array.isArray(prompt.options) ? prompt.options : [];
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<p>{prompt.message ?? "Select an option"}</p>
					<ul className="modal-list">
						{options.map((option) => (
							<li key={option.id}>
								<button
									type="button"
									className="btn"
									onClick={() => props.onRespond({ id: request.id, value: option.id })}
								>
									{option.label}
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

	if (request.method === "oauth_auth") {
		const message = request.info.instructions ?? "Continue authentication in your browser.";
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<p>{message}</p>
					<p className="settings-hint">
						<a href={request.info.url} target="_blank" rel="noreferrer">
							{request.info.url}
						</a>
					</p>
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
							Continue
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (request.method === "oauth_device_code") {
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<p>
						Enter code <code>{request.info.userCode}</code> at the verification page.
					</p>
					<p className="settings-hint">
						<a href={request.info.verificationUri} target="_blank" rel="noreferrer">
							{request.info.verificationUri}
						</a>
					</p>
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
							Continue
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (request.method === "oauth_info") {
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<p>{request.message}</p>
					{request.links.length > 0 ? (
						<ul className="modal-list">
							{request.links.map((link) => (
								<li key={link.url}>
									<a href={link.url} target="_blank" rel="noreferrer">
										{link.label ?? link.url}
									</a>
								</li>
							))}
						</ul>
					) : null}
					<div className="modal-actions">
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => (props.onDismiss ? props.onDismiss() : props.onRespond({ id: request.id, value: "ok" }))}
						>
							OK
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (request.method === "oauth_progress") {
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{titleOf(request)}</h2>
					<p>{request.message}</p>
					<div className="modal-actions">
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => (props.onDismiss ? props.onDismiss() : props.onRespond({ id: request.id, value: "ok" }))}
						>
							OK
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (
		request.method === "input" ||
		request.method === "editor" ||
		request.method === "oauth_prompt" ||
		request.method === "oauth_manual_code"
	) {
		const placeholder =
			request.method === "input" && typeof request.placeholder === "string"
				? request.placeholder
				: request.method === "oauth_prompt" &&
						typeof request.prompt === "object" &&
						request.prompt !== null &&
						"placeholder" in request.prompt &&
						typeof (request.prompt as { placeholder?: unknown }).placeholder === "string"
					? (request.prompt as { placeholder: string }).placeholder
					: request.method === "oauth_manual_code"
						? "Paste authorization code"
						: undefined;
		const heading =
			request.method === "oauth_prompt" &&
			typeof request.prompt === "object" &&
			request.prompt !== null &&
			"message" in request.prompt &&
			typeof (request.prompt as { message?: unknown }).message === "string"
				? (request.prompt as { message: string }).message
				: titleOf(request);
		return (
			<div className="modal-backdrop">
				<div className="modal">
					<h2>{heading}</h2>
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
