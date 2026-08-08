import type { WidgetItem } from "../store/session-store";

export function Widgets({ widgets, placement }: { widgets: WidgetItem[]; placement: "aboveEditor" | "belowEditor" }) {
	const items = widgets.filter((widget) => widget.placement === placement);
	if (items.length === 0) return null;
	return (
		<div className="widget-stack">
			{items.map((widget) => (
				<pre key={widget.key} className="widget-block">
					{widget.lines.join("\n")}
				</pre>
			))}
		</div>
	);
}
