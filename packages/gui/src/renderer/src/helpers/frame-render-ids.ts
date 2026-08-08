const requestIds = new Map<string, number>();

/** Monotonic requestId per componentId for `engine_custom_render`. */
export function nextFrameRenderRequestId(componentId: string): number {
	const next = (requestIds.get(componentId) ?? 0) + 1;
	requestIds.set(componentId, next);
	return next;
}

export function clearFrameRenderRequestId(componentId: string): void {
	requestIds.delete(componentId);
}

/** Test helper. */
export function resetFrameRenderRequestIds(): void {
	requestIds.clear();
}
