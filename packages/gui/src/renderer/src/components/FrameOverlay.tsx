import { useCallback, useEffect, useMemo, useRef } from "react";
import { ansiLineToSegments } from "../helpers/ansi";
import { nextFrameRenderRequestId } from "../helpers/frame-render-ids";
import { encodeTerminalKey, encodeTerminalKeyRelease } from "../helpers/key-encode";
import { encodeWheelDelta } from "../helpers/mouse-scroll";
import { defaultRenderGrid, frameRenderGrid, overlayOptionsToStyle } from "../helpers/overlay-geometry";
import type { CustomFrame } from "../store/session-store";

export function FrameOverlay(props: {
	frames: CustomFrame[];
	/** Native dialogs own keyboard input while true, even when a remote frame is focused. */
	modalOpen?: boolean;
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
					modalOpen={props.modalOpen === true}
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
	modalOpen: boolean;
	onDismiss: () => void;
	onInput: (data: string) => void;
	onRender: (requestId: number, width: number, rows: number) => void;
}) {
	const { onDismiss, onInput, onRender, frame, modalOpen } = props;
	const surfaceRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLPreElement>(null);
	const onInputRef = useRef(onInput);
	const onRenderRef = useRef(onRender);
	onInputRef.current = onInput;
	onRenderRef.current = onRender;

	const pipelineRender = useCallback((): void => {
		const el = bodyRef.current ?? surfaceRef.current;
		const rect = el?.getBoundingClientRect();
		const grid =
			rect && rect.width > 0 && rect.height > 0
				? defaultRenderGrid({ widthPx: rect.width, heightPx: rect.height })
				: frameRenderGrid(
						frame.overlayOptions,
						{ widthPx: window.innerWidth, heightPx: window.innerHeight },
						frame.overlay,
					);
		onRenderRef.current(nextFrameRenderRequestId(frame.componentId), grid.width, grid.rows);
	}, [frame.componentId, frame.overlay, frame.overlayOptions]);
	useEffect(() => {
		if (!frame.focused || modalOpen) return;
		const isUnhandledCtrlC = (event: KeyboardEvent): boolean =>
			event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "c" && !frame.handlesCtrlC;
		const isNativeControl = (event: KeyboardEvent): boolean => {
			if (!(event.target instanceof Element) || !surfaceRef.current?.contains(event.target)) return false;
			const isCloseButton = Boolean(event.target.closest(".frame-chrome button"));
			return event.key === "Tab" || ((event.key === "Enter" || event.key === " ") && isCloseButton);
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			if (isNativeControl(event) || isUnhandledCtrlC(event)) return;
			const encoded = encodeTerminalKey(event);
			if (encoded === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			onInputRef.current(encoded);
			pipelineRender();
		};
		const onKeyUp = (event: KeyboardEvent): void => {
			if (isNativeControl(event) || isUnhandledCtrlC(event)) return;
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
	}, [frame.focused, frame.handlesCtrlC, modalOpen, pipelineRender]);

	useEffect(() => {
		if (modalOpen || !frame.mouseScrollTracking || !frame.focused) return;
		const onWheel = (event: WheelEvent): void => {
			const encoded = encodeWheelDelta(event.deltaY);
			if (!encoded) return;
			event.preventDefault();
			onInputRef.current(encoded);
			pipelineRender();
		};
		window.addEventListener("wheel", onWheel, { passive: false, capture: true });
		return () => window.removeEventListener("wheel", onWheel, true);
	}, [frame.focused, frame.mouseScrollTracking, modalOpen, pipelineRender]);

	useEffect(() => {
		if (!frame.overlay || !frame.focused || modalOpen) return;
		const surface = surfaceRef.current;
		if (surface && !surface.contains(document.activeElement)) {
			surface.tabIndex = -1;
			surface.focus();
		}
	}, [frame.focused, frame.overlay, modalOpen]);

	const style = useMemo(() => overlayOptionsToStyle(frame.overlayOptions), [frame.overlayOptions]);

	return (
		<div
			ref={surfaceRef}
			tabIndex={frame.overlay && frame.focused && !modalOpen ? -1 : undefined}
			className={`frame-overlay${frame.overlay ? " frame-overlay-modal" : " frame-overlay-inline"}${
				frame.overlayOptions ? " frame-overlay-positioned" : ""
			}`}
			onKeyDown={(event) => {
				if (frame.overlay && !modalOpen && event.key === "Tab") {
					event.preventDefault();
					surfaceRef.current?.querySelector<HTMLButtonElement>(".frame-chrome button")?.focus();
				}
			}}
			style={style}
			role="dialog"
			aria-label="Extension UI"
			aria-modal={frame.overlay && frame.focused && !modalOpen ? true : undefined}
			aria-hidden={frame.focused && !modalOpen ? undefined : true}
			inert={frame.focused && !modalOpen ? undefined : true}
		>
			<div className="frame-chrome">
				<span>Extension UI · {frame.componentId}</span>
				<button type="button" className="btn" tabIndex={frame.focused && !modalOpen ? 0 : -1} onClick={onDismiss}>
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
