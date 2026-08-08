import { useEffect, useMemo, useRef } from "react";
import { ansiLinesToHtml } from "../helpers/ansi";
import { encodeTerminalKey } from "../helpers/key-encode";
import type { CustomFrame } from "../store/session-store";

export function FrameOverlay(props: {
	frames: CustomFrame[];
	onDismiss: (componentId: string) => void;
	onInput: (componentId: string, data: string) => void;
}) {
	const overlays = props.frames.filter((frame) => frame.overlay || !frame.widgetKey);
	if (overlays.length === 0) return null;

	return (
		<>
			{overlays.map((frame) => (
				<FrameSurface
					key={frame.componentId}
					frame={frame}
					onDismiss={() => props.onDismiss(frame.componentId)}
					onInput={(data) => props.onInput(frame.componentId, data)}
				/>
			))}
		</>
	);
}

function FrameSurface(props: { frame: CustomFrame; onDismiss: () => void; onInput: (data: string) => void }) {
	const html = useMemo(() => ansiLinesToHtml(props.frame.lines), [props.frame.lines]);
	const closeRef = useRef<HTMLButtonElement>(null);
	const { onDismiss, onInput } = props;

	useEffect(() => {
		closeRef.current?.focus();
		const onKeyDown = (event: KeyboardEvent): void => {
			const encoded = encodeTerminalKey(event);
			if (encoded === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			if (encoded === "\x1b") {
				onDismiss();
				return;
			}
			onInput(encoded);
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [onDismiss, onInput]);

	return (
		<div
			className={`frame-overlay${props.frame.overlay ? " frame-overlay-modal" : " frame-overlay-inline"}`}
			role="dialog"
			aria-label="Extension UI"
		>
			<div className="frame-chrome">
				<span>Extension UI · {props.frame.componentId}</span>
				<button ref={closeRef} type="button" className="btn" onClick={props.onDismiss}>
					Close
				</button>
			</div>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: ANSI→HTML from engine frames; escaped in ansi.ts */}
			<pre className="frame-body" dangerouslySetInnerHTML={{ __html: html }} />
		</div>
	);
}
