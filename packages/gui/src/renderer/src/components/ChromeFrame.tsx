import { ansiLineToSegments } from "../helpers/ansi";
import { encodeTerminalKey } from "../helpers/key-encode";
import type { CustomFrame } from "../store/session-store";

/** Renders a remote extension component in a host chrome slot. */
export function ChromeFrame(props: {
	frame: CustomFrame;
	slot: "header" | "footer" | "editor";
	onInput?: (data: string) => void;
}) {
	return (
		<section
			className={`chrome-frame chrome-frame-${props.slot}`}
			aria-label={`Extension ${props.slot}`}
			tabIndex={props.onInput ? 0 : undefined}
			onKeyDown={(event) => {
				const data = props.onInput ? encodeTerminalKey(event) : undefined;
				if (!data) return;
				event.preventDefault();
				props.onInput(data);
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
