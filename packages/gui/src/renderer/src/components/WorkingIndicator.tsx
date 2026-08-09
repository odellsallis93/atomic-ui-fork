import { useEffect, useState } from "react";

export function WorkingIndicator({
	label,
	frames,
	intervalMs,
}: {
	label: string;
	frames?: string[];
	intervalMs?: number;
}) {
	const [frameIndex, setFrameIndex] = useState(0);
	useEffect(() => {
		if (!frames || frames.length < 2) return;
		const timer = window.setInterval(() => setFrameIndex((index) => (index + 1) % frames.length), intervalMs ?? 250);
		return () => window.clearInterval(timer);
	}, [frames, intervalMs]);
	if (frames?.length === 0) return null;
	const glyph = frames?.[frameIndex] ?? "∀";
	return (
		<span className="working" aria-live="polite">
			<span className="working-glyph" aria-hidden="true">
				{glyph}
			</span>
			<span>{label}…</span>
		</span>
	);
}
