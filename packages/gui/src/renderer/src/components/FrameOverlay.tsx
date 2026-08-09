import { useCallback, useEffect, useMemo, useRef } from "react";
import { ansiLineToSegments } from "../helpers/ansi";
import { nextFrameRenderRequestId } from "../helpers/frame-render-ids";
import { encodeTerminalKey, encodeTerminalKeyRelease } from "../helpers/key-encode";
import { encodeWheelDelta } from "../helpers/mouse-scroll";
import { defaultRenderGrid, overlayOptionsToStyle } from "../helpers/overlay-geometry";
import type { CustomFrame } from "../store/session-store";

export function FrameOverlay(props: {
	frames: CustomFrame[];
	onDismiss: (componentId: string) => void;
	onInput: (componentId: string, data: string) => void;
	onRender: (componentId: string, requestId: number, width: number, rows: number) => void;
}) {
	const overlays = props.frames.filter(
		(frame) => !frame.hidden && !frame.chromeSlot && (frame.overlay || !frame.widgetKey),
	);
	if (overlays.length === 0) return null;

	return (
		<>
			{overlays.map((frame) => (
				<FrameSurface
					key={frame.componentId}
					frame={frame}
					onDismiss={() => props.onDismiss(frame.componentId)}
					onInput={(data) => props.onInput(frame.componentId, data)}
					onRender={(requestId, width, rows) => props.onRender(frame.componentId, requestId, width, rows)}
				/>
			))}
		</>
	);
}

function FrameSurface(props: {
	frame: CustomFrame;
	onDismiss: () => void;
	onInput: (data: string) => void;
	onRender: (requestId: number, width: number, rows: number) => void;
}) {
	const surfaceRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLPreElement>(null);
	const { onDismiss, onInput, onRender, frame } = props;
	const onInputRef = useRef(onInput);
	const onRenderRef = useRef(onRender);
	onInputRef.current = onInput;
	onRenderRef.current = onRender;

	const pipelineRender = useCallback((): void => {
		const el = bodyRef.current ?? surfaceRef.current;
		const rect = el?.getBoundingClientRect();
		const grid = defaultRenderGrid({
			widthPx: rect?.width && rect.width > 0 ? rect.width : window.innerWidth * 0.8,
			heightPx: rect?.height && rect.height > 0 ? rect.height : window.innerHeight * 0.6,
		});
		onRenderRef.current(nextFrameRenderRequestId(frame.componentId), grid.width, grid.rows);
	}, [frame.componentId]);

	useEffect(() => {
		if (!frame.focused) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			const encoded = encodeTerminalKey(event);
			if (encoded === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			onInputRef.current(encoded);
			pipelineRender();
		};
		const onKeyUp = (event: KeyboardEvent): void => {
			const encoded = encodeTerminalKeyRelease(event);
			if (encoded === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			onInputRef.current(encoded);
			pipelineRender();
		};
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("keyup", onKeyUp, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("keyup", onKeyUp, true);
		};
	}, [frame.focused, pipelineRender]);

	useEffect(() => {
		if (!frame.mouseScrollTracking || !frame.focused) return;
		const onWheel = (event: WheelEvent): void => {
			const encoded = encodeWheelDelta(event.deltaY);
			if (!encoded) return;
			event.preventDefault();
			onInputRef.current(encoded);
			pipelineRender();
		};
		window.addEventListener("wheel", onWheel, { passive: false, capture: true });
		return () => window.removeEventListener("wheel", onWheel, true);
	}, [frame.focused, frame.mouseScrollTracking, pipelineRender]);

	const style = useMemo(() => overlayOptionsToStyle(frame.overlayOptions), [frame.overlayOptions]);

	return (
		<div
			ref={surfaceRef}
			className={`frame-overlay${frame.overlay ? " frame-overlay-modal" : " frame-overlay-inline"}${
				frame.overlayOptions ? " frame-overlay-positioned" : ""
			}`}
			style={style}
			role="dialog"
			aria-label="Extension UI"
			aria-hidden={!frame.focused}
		>
			<div className="frame-chrome">
				<span>Extension UI · {frame.componentId}</span>
				<button type="button" className="btn" onClick={onDismiss}>
					Close
				</button>
			</div>
			<pre ref={bodyRef} className={`frame-body${frame.terminalAutowrap ? "" : " frame-body-no-wrap"}`}>
				{frame.lines.map((line) => (
					<div key={`${frame.componentId}-${line}`} className="ansi-line">
						{ansiLineToSegments(line).map((segment) => (
							<span
								key={`${frame.componentId}-${line}-${segment.text}-${segment.fg ?? ""}-${segment.bg ?? ""}`}
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
			</pre>
		</div>
	);
}
