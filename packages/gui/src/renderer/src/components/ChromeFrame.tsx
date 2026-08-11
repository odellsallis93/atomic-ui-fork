import { useEffect, useRef } from "react";
import { ansiLineToSegments } from "../helpers/ansi";
import { encodeTerminalKey, encodeTerminalKeyRelease } from "../helpers/key-encode";
import type { CustomFrame } from "../store/session-store";

/** Renders a remote extension component in a host chrome slot. */
export function ChromeFrame(props: {
	frame: CustomFrame;
	slot: "header" | "footer" | "editor";
	onInput?: (data: string) => void;
	/** Prevent a focused remote editor from competing with a native modal. */
	modalOpen?: boolean;
}) {
	const ref = useRef<HTMLElement | null>(null);
	const componentId = props.frame.componentId;
	useEffect(() => {
		if (props.onInput && componentId) ref.current?.focus();
	}, [componentId, props.onInput]);
	return (
		<section
			ref={ref}
			className={`chrome-frame chrome-frame-${props.slot}`}
			aria-label={`Extension ${props.slot}`}
			aria-hidden={props.modalOpen || undefined}
			tabIndex={props.onInput && !props.modalOpen ? 0 : undefined}
			onKeyDown={(event) => {
				const onInput = props.onInput;
				if (!onInput || props.modalOpen) return;
				if (
					event.ctrlKey &&
					!event.altKey &&
					!event.metaKey &&
					event.key.toLowerCase() === "c" &&
					!props.frame.handlesCtrlC
				)
					return;
				const data = encodeTerminalKey(event);
				if (!data) return;
				event.preventDefault();
				event.stopPropagation();
				onInput(data);
			}}
			onKeyUp={(event) => {
				const onInput = props.onInput;
				if (!onInput || props.modalOpen) return;
				if (
					event.ctrlKey &&
					!event.altKey &&
					!event.metaKey &&
					event.key.toLowerCase() === "c" &&
					!props.frame.handlesCtrlC
				)
					return;
				const data = encodeTerminalKeyRelease(event);
				if (!data) return;
				event.preventDefault();
				event.stopPropagation();
				onInput(data);
			}}
		>
			{props.frame.lines.map((line) => (
				<div key={`${props.frame.componentId}-${line}`} className="ansi-line">
					{ansiLineToSegments(line).map((segment) => (
						<span
							key={`${props.frame.componentId}-${line}-${segment.text}-${segment.fg ?? ""}-${segment.bg ?? ""}`}
							style={{
								color: segment.fg,
								background: segment.bg,
								fontWeight: segment.bold ? 700 : undefined,
								opacity: segment.dim ? 0.65 : undefined,
								textDecoration: segment.underline ? "underline" : undefined,
							}}
						>
							{segment.text}
						</span>
					))}
				</div>
			))}
		</section>
	);
}
