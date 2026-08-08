/**
 * Encode a DOM wheel delta as an xterm-style mouse wheel report (button 64/65).
 * Components that enable mouse-scroll-tracking receive these as `engine_custom_input`.
 */
export function encodeWheelDelta(deltaY: number): string | undefined {
	if (deltaY === 0 || !Number.isFinite(deltaY)) return undefined;
	const button = deltaY > 0 ? 65 : 64;
	// SGR mouse: ESC [ < button ; col ; row M  — use 1,1 as a synthetic cell.
	return `\x1b[<${button};1;1M`;
}
