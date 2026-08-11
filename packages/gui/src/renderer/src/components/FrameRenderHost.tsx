import { useEffect, useRef } from "react";
import { clearFrameRenderRequestId, nextFrameRenderRequestId } from "../helpers/frame-render-ids";
import { frameRenderGrid } from "../helpers/overlay-geometry";
import type { CustomFrame } from "../store/session-store";

function frameRenderSignature(frames: CustomFrame[]): string {
	return frames
		.map((frame) => `${frame.componentId}:${frame.renderGeneration}:${frame.hidden ? 1 : 0}:${frame.overlay ? 1 : 0}`)
		.join("|");
}

/**
 * Drives `engine_custom_render` for every open custom frame (overlay or widget).
 * Re-requests only when a frame opens, is invalidated (`renderGeneration`), or
 * toggles visibility — not on every painted `engine_custom_frame`.
 */
export function FrameRenderHost(props: {
	frames: CustomFrame[];
	onRender: (componentId: string, requestId: number, width: number, rows: number) => void;
}) {
	const { frames, onRender } = props;
	const knownIds = useRef(new Set<string>());
	const onRenderRef = useRef(onRender);
	const framesRef = useRef(frames);
	onRenderRef.current = onRender;
	framesRef.current = frames;
	const signature = frameRenderSignature(frames);
	useEffect(() => {
		const current = signature ? framesRef.current : [];
		const live = new Set(current.map((frame) => frame.componentId));
		for (const frame of current) {
			if (frame.hidden) continue;
			const requestId = nextFrameRenderRequestId(frame.componentId);
			const grid = frameRenderGrid(
				frame.overlayOptions,
				{ widthPx: window.innerWidth, heightPx: window.innerHeight },
				frame.overlay,
			);
			onRenderRef.current(frame.componentId, requestId, grid.width, grid.rows);
		}
		for (const componentId of knownIds.current) {
			if (!live.has(componentId)) clearFrameRenderRequestId(componentId);
		}
		knownIds.current = live;
	}, [signature]);

	return null;
}
