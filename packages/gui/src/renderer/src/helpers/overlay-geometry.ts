import type { CSSProperties } from "react";
import type { GuiOverlayOptions } from "../../../shared/overlay-options.ts";

const DEFAULT_CELL_WIDTH_PX = 8.4;
const DEFAULT_CELL_HEIGHT_PX = 18;

function dimToCss(value: number | string | undefined, cellPx: number): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return value;
	return `${Math.max(0, value) * cellPx}px`;
}

function marginCss(
	margin: GuiOverlayOptions["margin"],
	cellPx: number,
): { top?: string; right?: string; bottom?: string; left?: string } {
	if (margin === undefined) return {};
	if (typeof margin === "number") {
		const css = dimToCss(margin, cellPx);
		return { top: css, right: css, bottom: css, left: css };
	}
	return {
		top: dimToCss(margin.top, cellPx),
		right: dimToCss(margin.right, cellPx),
		bottom: dimToCss(margin.bottom, cellPx),
		left: dimToCss(margin.left, cellPx),
	};
}

/**
 * Map engine overlayOptions onto CSS for a fixed-position frame surface.
 * Numeric sizes are treated as terminal cells using the measured cell metrics.
 */
export function overlayOptionsToStyle(
	options: GuiOverlayOptions | undefined,
	metrics: { cellWidthPx: number; cellHeightPx: number } = {
		cellWidthPx: DEFAULT_CELL_WIDTH_PX,
		cellHeightPx: DEFAULT_CELL_HEIGHT_PX,
	},
): CSSProperties {
	if (!options) return {};
	const style: CSSProperties = {};
	const width = dimToCss(options.width, metrics.cellWidthPx);
	const maxWidth = dimToCss(options.maxWidth, metrics.cellWidthPx);
	const maxHeight = dimToCss(options.maxHeight, metrics.cellHeightPx);
	const minWidth = dimToCss(options.minWidth, metrics.cellWidthPx);
	const minHeight = dimToCss(options.minHeight, metrics.cellHeightPx);
	if (width) style.width = width;
	if (maxWidth) style.maxWidth = maxWidth;
	if (maxHeight) style.maxHeight = maxHeight;
	if (minWidth) style.minWidth = minWidth;
	if (minHeight) style.minHeight = minHeight;

	const margins = marginCss(options.margin, metrics.cellHeightPx);
	const offsetX = typeof options.offsetX === "number" ? options.offsetX * metrics.cellWidthPx : 0;
	const offsetY = typeof options.offsetY === "number" ? options.offsetY * metrics.cellHeightPx : 0;
	const col = dimToCss(options.col, metrics.cellWidthPx);
	const row = dimToCss(options.row, metrics.cellHeightPx);
	const anchor = options.anchor ?? "center";

	if (col !== undefined) style.left = col;
	if (row !== undefined) style.top = row;

	switch (anchor) {
		case "top":
			style.top = margins.top ?? "1rem";
			style.left = "50%";
			style.transform = `translate(calc(-50% + ${offsetX}px), ${offsetY}px)`;
			break;
		case "bottom":
			style.bottom = margins.bottom ?? "1rem";
			style.top = "auto";
			style.left = "50%";
			style.transform = `translate(calc(-50% + ${offsetX}px), ${offsetY}px)`;
			break;
		case "left":
			style.left = margins.left ?? "1rem";
			style.top = "50%";
			style.transform = `translate(${offsetX}px, calc(-50% + ${offsetY}px))`;
			break;
		case "right":
			style.right = margins.right ?? "1rem";
			style.left = "auto";
			style.top = "50%";
			style.transform = `translate(${offsetX}px, calc(-50% + ${offsetY}px))`;
			break;
		case "top-left":
			style.top = margins.top ?? row ?? "1rem";
			style.left = margins.left ?? col ?? "1rem";
			style.transform = `translate(${offsetX}px, ${offsetY}px)`;
			break;
		case "top-right":
			style.top = margins.top ?? row ?? "1rem";
			style.right = margins.right ?? "1rem";
			style.left = "auto";
			style.transform = `translate(${offsetX}px, ${offsetY}px)`;
			break;
		case "bottom-left":
			style.bottom = margins.bottom ?? "1rem";
			style.top = "auto";
			style.left = margins.left ?? col ?? "1rem";
			style.transform = `translate(${offsetX}px, ${offsetY}px)`;
			break;
		case "bottom-right":
			style.bottom = margins.bottom ?? "1rem";
			style.top = "auto";
			style.right = margins.right ?? "1rem";
			style.left = "auto";
			style.transform = `translate(${offsetX}px, ${offsetY}px)`;
			break;
		default:
			if (col === undefined && row === undefined) {
				style.top = "50%";
				style.left = "50%";
				style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
			} else if (offsetX !== 0 || offsetY !== 0) {
				style.transform = `translate(${offsetX}px, ${offsetY}px)`;
			}
			break;
	}

	return style;
}

export function defaultRenderGrid(viewport: { widthPx: number; heightPx: number }): {
	width: number;
	rows: number;
	cellWidthPx: number;
	cellHeightPx: number;
} {
	const cellWidthPx = DEFAULT_CELL_WIDTH_PX;
	const cellHeightPx = DEFAULT_CELL_HEIGHT_PX;
	return {
		width: Math.max(20, Math.floor(viewport.widthPx / cellWidthPx)),
		rows: Math.max(5, Math.floor(viewport.heightPx / cellHeightPx)),
		cellWidthPx,
		cellHeightPx,
	};
}

/**
 * Choose the initial terminal grid before the frame has painted. The engine may
 * request a full viewport overlay; otherwise preserve the compact host defaults.
 */
export function frameRenderGrid(
	overlayOptions: GuiOverlayOptions | undefined,
	viewport: { widthPx: number; heightPx: number },
	overlay: boolean,
): { width: number; rows: number; cellWidthPx: number; cellHeightPx: number } {
	const widthPx =
		overlay && overlayOptions?.width === "100%" ? viewport.widthPx : viewport.widthPx * (overlay ? 0.8 : 0.96);
	const heightPx =
		overlay && overlayOptions?.maxHeight === "100%" ? viewport.heightPx : viewport.heightPx * (overlay ? 0.6 : 0.25);
	return defaultRenderGrid({ widthPx, heightPx });
}
