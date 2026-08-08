/** Serializable overlay geometry mirrored from the interactive-engine protocol. */
export interface GuiOverlayOptions {
	anchor?: string;
	col?: number | string;
	margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
	maxHeight?: number | string;
	maxWidth?: number | string;
	minHeight?: number;
	minWidth?: number;
	offsetX?: number;
	offsetY?: number;
	row?: number | string;
	width?: number | string;
}

export function parseOverlayOptions(value: unknown): GuiOverlayOptions | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const raw = value as Record<string, unknown>;
	const options: GuiOverlayOptions = {};
	if (typeof raw.anchor === "string") options.anchor = raw.anchor;
	if (typeof raw.col === "number" || typeof raw.col === "string") options.col = raw.col;
	if (typeof raw.row === "number" || typeof raw.row === "string") options.row = raw.row;
	if (typeof raw.width === "number" || typeof raw.width === "string") options.width = raw.width;
	if (typeof raw.maxWidth === "number" || typeof raw.maxWidth === "string") options.maxWidth = raw.maxWidth;
	if (typeof raw.maxHeight === "number" || typeof raw.maxHeight === "string") options.maxHeight = raw.maxHeight;
	if (typeof raw.minWidth === "number") options.minWidth = raw.minWidth;
	if (typeof raw.minHeight === "number") options.minHeight = raw.minHeight;
	if (typeof raw.offsetX === "number") options.offsetX = raw.offsetX;
	if (typeof raw.offsetY === "number") options.offsetY = raw.offsetY;
	if (typeof raw.margin === "number") {
		options.margin = raw.margin;
	} else if (typeof raw.margin === "object" && raw.margin !== null) {
		const margin = raw.margin as Record<string, unknown>;
		options.margin = {
			top: typeof margin.top === "number" ? margin.top : undefined,
			right: typeof margin.right === "number" ? margin.right : undefined,
			bottom: typeof margin.bottom === "number" ? margin.bottom : undefined,
			left: typeof margin.left === "number" ? margin.left : undefined,
		};
	}
	return options;
}
