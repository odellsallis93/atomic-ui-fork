import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
	'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Keeps keyboard focus inside a native modal and returns it to the opener. */
export function useModalFocus<T extends HTMLElement>(initialSelector?: string, onEscape?: () => void) {
	const dialogRef = useRef<T | null>(null);
	const initialSelectorRef = useRef(initialSelector);
	const onEscapeRef = useRef(onEscape);
	onEscapeRef.current = onEscape;

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const focusInitial = window.setTimeout(() => {
			const first =
				dialog.querySelector<HTMLElement>(
					initialSelectorRef.current ?? 'input, textarea, select, [contenteditable="true"]',
				) ?? dialog.querySelector<HTMLElement>("button:not(:disabled), a[href]");
			first?.focus();
		}, 0);
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && onEscapeRef.current) {
				event.preventDefault();
				onEscapeRef.current();
				return;
			}
			if (event.key !== "Tab") return;
			const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
			if (focusable.length === 0) {
				event.preventDefault();
				return;
			}
			const first = focusable[0];
			const last = focusable.at(-1);
			if (!last) return;
			if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
				event.preventDefault();
				first?.focus();
			}
		};
		dialog.addEventListener("keydown", onKeyDown);
		return () => {
			window.clearTimeout(focusInitial);
			dialog.removeEventListener("keydown", onKeyDown);
			if (previous?.isConnected) previous.focus();
		};
	}, []);

	return dialogRef;
}
