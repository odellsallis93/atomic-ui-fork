export function WorkingIndicator({ label }: { label: string }) {
	return (
		<span className="working" aria-live="polite">
			<span className="working-glyph" aria-hidden="true">
				∀
			</span>
			<span>{label}…</span>
		</span>
	);
}
