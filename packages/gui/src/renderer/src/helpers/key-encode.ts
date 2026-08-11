/**
 * Encode browser KeyboardEvents into legacy terminal sequences that pi-tui's
 * `matchesKey` accepts (protocol plan §3 / M5 frame surface).
 */

const ARROWS: Record<string, string> = {
	ArrowUp: "\x1b[A",
	ArrowDown: "\x1b[B",
	ArrowRight: "\x1b[C",
	ArrowLeft: "\x1b[D",
};

const SPECIAL: Record<string, string> = {
	Escape: "\x1b",
	Enter: "\r",
	Tab: "\t",
	Backspace: "\x7f",
	Delete: "\x1b[3~",
	Home: "\x1b[H",
	End: "\x1b[F",
	PageUp: "\x1b[5~",
	PageDown: "\x1b[6~",
	Insert: "\x1b[2~",
	" ": " ",
};

const FUNCTION_KEYS: Record<string, string> = {
	F1: "\x1bOP",
	F2: "\x1bOQ",
	F3: "\x1bOR",
	F4: "\x1bOS",
	F5: "\x1b[15~",
	F6: "\x1b[17~",
	F7: "\x1b[18~",
	F8: "\x1b[19~",
	F9: "\x1b[20~",
	F10: "\x1b[21~",
	F11: "\x1b[23~",
	F12: "\x1b[24~",
};

function ctrlChar(key: string): string | undefined {
	if (key.length !== 1) return undefined;
	const lower = key.toLowerCase();
	if (lower < "a" || lower > "z") {
		if (lower === " ") return "\x00";
		if (lower === "[") return "\x1b";
		return undefined;
	}
	return String.fromCharCode(lower.charCodeAt(0) - 96);
}

export interface KeyEncodeInput {
	key: string;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}

/** Positive Kitty functional-key codepoints. pi-tui normalizes these to its internal negative IDs. */
const KITTY_FUNCTIONAL_CODEPOINTS: Record<string, number> = {
	ArrowUp: 57419,
	ArrowDown: 57420,
	ArrowRight: 57418,
	ArrowLeft: 57417,
	Insert: 57425,
	Delete: 57426,
	PageUp: 57421,
	PageDown: 57422,
	Home: 57423,
	End: 57424,
};

function kittyModifierValue(event: KeyEncodeInput): number {
	let bits = 0;
	if (event.shiftKey) bits |= 1;
	if (event.altKey) bits |= 2;
	if (event.ctrlKey) bits |= 4;
	if (event.metaKey) bits |= 8;
	return bits + 1;
}

function codepointForKitty(event: KeyEncodeInput): number | undefined {
	const { key, shiftKey } = event;
	if (KITTY_FUNCTIONAL_CODEPOINTS[key] !== undefined) return KITTY_FUNCTIONAL_CODEPOINTS[key];
	if (key === "Escape") return 27;
	if (key === "Tab") return 9;
	if (key === "Enter") return 13;
	if (key === "Backspace") return 127;
	if (key === " ") return 32;
	if (key.length === 1) {
		if (shiftKey && key >= "A" && key <= "Z") return key.charCodeAt(0);
		return key.toLowerCase().charCodeAt(0);
	}
	return undefined;
}

/**
 * Kitty keyboard protocol release event (flag 2: `:3` event type).
 * The engine child filters these unless `component.wantsKeyRelease === true`.
 */
export function encodeTerminalKeyRelease(event: KeyEncodeInput): string | undefined {
	if (event.key === "Control" || event.key === "Alt" || event.key === "Shift" || event.key === "Meta") {
		return undefined;
	}
	const codepoint = codepointForKitty(event);
	if (codepoint === undefined) return undefined;
	const mod = kittyModifierValue(event);
	return `\x1b[${codepoint};${mod}:3u`;
}

/**
 * Returns the terminal input bytes for a key event, or undefined when the event
 * should be ignored (e.g. bare modifier keys).
 */
export function encodeTerminalKey(event: KeyEncodeInput): string | undefined {
	const { key, ctrlKey, altKey, metaKey, shiftKey } = event;
	if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return undefined;

	if (key === "Tab" && shiftKey && !ctrlKey && !altKey && !metaKey) return "\x1b[Z";

	if (ARROWS[key]) {
		if (ctrlKey && !altKey && !metaKey) {
			if (key === "ArrowLeft") return "\x1b[1;5D";
			if (key === "ArrowRight") return "\x1b[1;5C";
			if (key === "ArrowUp") return "\x1bOa";
			if (key === "ArrowDown") return "\x1bOb";
		}
		if (altKey && !ctrlKey && !metaKey) {
			if (key === "ArrowUp") return "\x1bp";
			if (key === "ArrowDown") return "\x1bn";
			if (key === "ArrowLeft") return "\x1b[1;3D";
			if (key === "ArrowRight") return "\x1b[1;3C";
		}
		return ARROWS[key];
	}

	if (FUNCTION_KEYS[key] && !ctrlKey && !altKey && !metaKey && !shiftKey) {
		return FUNCTION_KEYS[key];
	}

	if (SPECIAL[key] && !ctrlKey && !altKey && !metaKey) {
		return SPECIAL[key];
	}

	if (ctrlKey && !altKey && !metaKey) {
		const ctrl = ctrlChar(key);
		if (ctrl !== undefined) return ctrl;
	}

	if (altKey && !ctrlKey && !metaKey && key.length === 1) {
		return `\x1b${key}`;
	}

	if (!ctrlKey && !altKey && !metaKey && key.length === 1) {
		return key;
	}

	return undefined;
}
