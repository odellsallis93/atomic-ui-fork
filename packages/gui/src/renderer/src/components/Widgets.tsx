import { ansiLineToSegments } from "../helpers/ansi";
import type { WidgetItem } from "../store/session-store";

export function Widgets({ widgets, placement }: { widgets: WidgetItem[]; placement: "aboveEditor" | "belowEditor" }) {
	const items = widgets.filter((widget) => widget.placement === placement);
	if (items.length === 0) return null;
	return (
		<div className="widget-stack">
			{items.map((widget) => (
				<pre key={widget.key} className="widget-block">
					{widget.lines.map((line) => (
						<div key={`${widget.key}-${line}`} className="ansi-line">
							{ansiLineToSegments(line).map((segment) => (
								<span
									key={`${widget.key}-${line}-${segment.text}-${segment.fg ?? ""}-${segment.bg ?? ""}`}
									style={{
										color: segment.fg,
										background: segment.bg,
										fontWeight: segment.bold ? 700 : undefined,
										opacity: segment.dim ? 0.65 : undefined,
										textDecoration: segment.underline ? "underline" : undefined,
									}}
								>
									{segment.text}
								</span>
							))}
						</div>
					))}
				</pre>
			))}
		</div>
	);
}
