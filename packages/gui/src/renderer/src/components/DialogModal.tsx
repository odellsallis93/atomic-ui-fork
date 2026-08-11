import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtensionUiRequest, ExtensionUiResponse } from "../../../shared/ipc";
import { useModalFocus } from "../helpers/modal-focus";

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
	const requestPrefill =
		request.method === "editor" && typeof request.prefill === "string" ? request.prefill : undefined;
	const requestTimeout = "timeout" in request && typeof request.timeout === "number" ? request.timeout : undefined;
	const [value, setValue] = useState(requestPrefill ?? "");
	const valueRef = useRef(value);
	valueRef.current = value;
	const onRespondRef = useRef(props.onRespond);
	const onDismissRef = useRef(props.onDismiss);
	const respondedRef = useRef(false);
	onRespondRef.current = props.onRespond;
	onDismissRef.current = props.onDismiss;
	const dialogRef = useModalFocus<HTMLDivElement>();
	const respondOnce = useCallback(
		(response: ExtensionUiResponse): void => {
			if (respondedRef.current || response.id !== request.id) return;
			respondedRef.current = true;
			onRespondRef.current(response);
		},
		[request.id],
	);
	const dismissOnce = useCallback((): void => {
		if (respondedRef.current) return;
		respondedRef.current = true;
		onDismissRef.current?.();
	}, []);

	useEffect(() => {
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const focus = window.setTimeout(() => {
			(
				document.querySelector(
					".modal-backdrop .modal input, .modal-backdrop .modal textarea, .modal-backdrop .modal button",
				) as HTMLElement | null
			)?.focus();
		}, 0);
		const cancel = () => respondOnce({ id: request.id, cancelled: true });
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				cancel();
				return;
			}
			if (event.key === "Enter" && request.method !== "editor" && event.target instanceof HTMLInputElement) {
				event.preventDefault();
				event.stopPropagation();
				respondOnce({ id: request.id, value: event.target.value });
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		const timeout = requestTimeout && requestTimeout > 0 ? window.setTimeout(cancel, requestTimeout) : undefined;
		return () => {
			window.clearTimeout(focus);
			if (timeout !== undefined) window.clearTimeout(timeout);
			window.removeEventListener("keydown", onKeyDown, true);
			if (previous?.isConnected) previous.focus();
		};
	}, [request.id, request.method, requestTimeout, respondOnce]);
	if (request.method === "confirm") {
		return (
			<div className="modal-backdrop">
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
					<h2>{titleOf(request)}</h2>
					<p>{typeof request.message === "string" ? request.message : ""}</p>
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={() => respondOnce({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => respondOnce({ id: request.id, confirmed: true })}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
					<h2>{titleOf(request)}</h2>
					<ul className="modal-list">
						{options.map((option) => (
							<li key={option}>
								<button
									type="button"
									className="btn"
									onClick={() => respondOnce({ id: request.id, value: option })}
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
							onClick={() => respondOnce({ id: request.id, cancelled: true })}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
					<h2>{titleOf(request)}</h2>
					<p>{prompt.message ?? "Select an option"}</p>
					<ul className="modal-list">
						{options.map((option) => (
							<li key={option.id}>
								<button
									type="button"
									className="btn"
									onClick={() => respondOnce({ id: request.id, value: option.id })}
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
							onClick={() => respondOnce({ id: request.id, cancelled: true })}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
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
							onClick={() => respondOnce({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => respondOnce({ id: request.id, confirmed: true })}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
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
							onClick={() => respondOnce({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => respondOnce({ id: request.id, confirmed: true })}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
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
							onClick={() => (props.onDismiss ? dismissOnce() : respondOnce({ id: request.id, value: "ok" }))}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={titleOf(request)}>
					<h2>{titleOf(request)}</h2>
					<p>{request.message}</p>
					<div className="modal-actions">
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => (props.onDismiss ? dismissOnce() : respondOnce({ id: request.id, value: "ok" }))}
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
				<div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={heading}>
					<h2>{heading}</h2>
					{request.method === "editor" ? (
						<textarea
							className="modal-input"
							aria-label={heading}
							rows={8}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					) : (
						<input
							className="modal-input"
							aria-label={heading}
							placeholder={placeholder}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					)}
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={() => respondOnce({ id: request.id, cancelled: true })}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => respondOnce({ id: request.id, value: valueRef.current })}
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
