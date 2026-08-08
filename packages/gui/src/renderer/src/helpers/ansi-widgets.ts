import { ansiLinesToHtml } from "./ansi.ts";

/** Convert widget ANSI lines to escaped HTML for the widget stack. */
export function widgetLinesToHtml(lines: string[]): string {
	return ansiLinesToHtml(lines);
}
