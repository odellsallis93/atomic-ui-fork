export const DEFAULT_ENTRY_HEIGHT = 120;
export const VIRTUAL_OVERSCAN_PX = 800;

export interface VirtualWindow {
	start: number;
	end: number;
	totalHeight: number;
	offsets: number[];
}

/**
 * Calculates a bounded render range for variable-height transcript entries.
 * Unknown rows use a conservative estimate until ResizeObserver measures them.
 */
export function getVirtualWindow(
	entryCount: number,
	scrollTop: number,
	viewportHeight: number,
	heights: ReadonlyMap<string, number>,
	ids: readonly string[],
	estimatedHeight = DEFAULT_ENTRY_HEIGHT,
	overscan = VIRTUAL_OVERSCAN_PX,
): VirtualWindow {
	const offsets = new Array<number>(entryCount + 1);
	offsets[0] = 0;
	for (let index = 0; index < entryCount; index += 1) {
		offsets[index + 1] = offsets[index] + (heights.get(ids[index] ?? "") ?? estimatedHeight);
	}

	const before = Math.max(0, scrollTop - overscan);
	const after = scrollTop + viewportHeight + overscan;
	let start = 0;
	while (start < entryCount && offsets[start + 1] <= before) start += 1;
	let end = start;
	while (end < entryCount && offsets[end] < after) end += 1;
	return { start, end, totalHeight: offsets[entryCount], offsets };
}

export function isNearTranscriptEnd(
	scrollTop: number,
	viewportHeight: number,
	scrollHeight: number,
	threshold = 32,
): boolean {
	return scrollHeight - scrollTop - viewportHeight <= threshold;
}
