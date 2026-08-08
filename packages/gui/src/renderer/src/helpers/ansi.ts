/**
 * Minimal ANSI SGR → HTML converter for engine_custom_frame lines.
 * Handles colors, bold/dim/underline, and strips unsupported CSI/OSC sequences.
 */

const ANSI_COLORS: Record<number, string> = {
	30: "#1e1e2e",
	31: "#f38ba8",
	32: "#a6e3a1",
	33: "#f9e2af",
	34: "#89b4fa",
	35: "#cba6f7",
	36: "#94e2d5",
	37: "#cdd6f4",
	90: "#6c7086",
	91: "#f38ba8",
	92: "#a6e3a1",
	93: "#f9e2af",
	94: "#89b4fa",
	95: "#cba6f7",
	96: "#94e2d5",
	97: "#ffffff",
};

const ANSI_BG: Record<number, string> = {
	40: "#1e1e2e",
	41: "#3c2828",
	42: "#283228",
	43: "#3a3420",
	44: "#1e2a3a",
	45: "#2d2838",
	46: "#1e3030",
	47: "#313244",
	100: "#313244",
	101: "#3c2828",
	102: "#283228",
	103: "#3a3420",
	104: "#1e2a3a",
	105: "#2d2838",
	106: "#1e3030",
	107: "#45475a",
};

interface StyleState {
	fg?: string;
	bg?: string;
	bold: boolean;
	dim: boolean;
	underline: boolean;
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function openSpan(state: StyleState): string {
	const styles: string[] = [];
	if (state.fg) styles.push(`color:${state.fg}`);
	if (state.bg) styles.push(`background:${state.bg}`);
	if (state.bold) styles.push("font-weight:700");
	if (state.dim) styles.push("opacity:0.65");
	if (state.underline) styles.push("text-decoration:underline");
	if (styles.length === 0) return "";
	return `<span style="${styles.join(";")}">`;
}

function applySgr(codes: number[], state: StyleState): void {
	if (codes.length === 0) codes = [0];
	for (let i = 0; i < codes.length; i++) {
		const code = codes[i] ?? 0;
		if (code === 0) {
			state.fg = undefined;
			state.bg = undefined;
			state.bold = false;
			state.dim = false;
			state.underline = false;
		} else if (code === 1) state.bold = true;
		else if (code === 2) state.dim = true;
		else if (code === 4) state.underline = true;
		else if (code === 22) {
			state.bold = false;
			state.dim = false;
		} else if (code === 24) state.underline = false;
		else if (code === 39) state.fg = undefined;
		else if (code === 49) state.bg = undefined;
		else if (code === 38 && codes[i + 1] === 5) {
			// 256-color fg — approximate with grayscale/palette skip; keep prior
			i += 2;
		} else if (code === 48 && codes[i + 1] === 5) {
			i += 2;
		} else if (ANSI_COLORS[code]) state.fg = ANSI_COLORS[code];
		else if (ANSI_BG[code]) state.bg = ANSI_BG[code];
	}
}

export function ansiLineToHtml(line: string): string {
	const state: StyleState = { bold: false, dim: false, underline: false };
	let html = "";
	let open = false;
	let i = 0;
	const text = line.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");

	const flushOpen = (): void => {
		if (open) {
			html += "</span>";
			open = false;
		}
	};

	while (i < text.length) {
		if (text[i] === "\x1b" && text[i + 1] === "[") {
			const end = text.indexOf("m", i + 2);
			if (end === -1) {
				i += 1;
				continue;
			}
			const body = text.slice(i + 2, end);
			const codes = body
				.split(";")
				.filter((part) => part.length > 0)
				.map((part) => Number.parseInt(part, 10))
				.filter((n) => Number.isFinite(n));
			flushOpen();
			applySgr(codes, state);
			const span = openSpan(state);
			if (span) {
				html += span;
				open = true;
			}
			i = end + 1;
			continue;
		}
		if (text[i] === "\x1b") {
			i += 1;
			continue;
		}
		html += escapeHtml(text[i]!);
		i += 1;
	}
	flushOpen();
	return html || "&nbsp;";
}

export function ansiLinesToHtml(lines: string[]): string {
	return lines.map((line) => `<div class="ansi-line">${ansiLineToHtml(line)}</div>`).join("");
}
